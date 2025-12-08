// controllers/DeviceController.cpp (FIXED: KEEP-ALIVE LOOP)
#include "DeviceController.h"
#include "../utils/helpers.h"
#include "../utils/logging.h"
#include "../utils/escapi.h"
#include <sstream>
#include <thread>
#include <algorithm> // Can cho std::find

using namespace std;
using namespace Gdiplus;

string DeviceController::G_DEVICE_LIST_JSON = "{\"video\":[],\"audio\":[]}";
std::mutex DeviceController::G_DEVICE_LIST_MUTEX;
std::atomic<bool> DeviceController::G_IS_REFRESHING(false);

std::vector<SOCKET> DeviceController::viewingClients;
std::mutex DeviceController::streamMutex;
std::atomic<bool> DeviceController::isStreaming(false);

// --- HELPER: Raw Pixels -> JPEG ---
string rawToJpeg(int *rawPixels, int w, int h)
{
    Bitmap bmp(w, h, w * 4, PixelFormat32bppARGB, (BYTE *)rawPixels);
    CLSID clsid;
    GetEncoderClsid(L"image/jpeg", &clsid);

    ULONG quality = 75; // Chat luong JPEG (0-100)
    EncoderParameters eps;
    eps.Count = 1;
    eps.Parameter[0].Guid = EncoderQuality;
    eps.Parameter[0].Type = EncoderParameterValueTypeLong;
    eps.Parameter[0].NumberOfValues = 1;
    eps.Parameter[0].Value = &quality;

    IStream *pStream = NULL;
    if (CreateStreamOnHGlobal(NULL, TRUE, &pStream) != S_OK)
        return "";

    bmp.Save(pStream, &clsid, &eps);

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

// --- 1. LAY DANH SACH ---
void DeviceController::buildDeviceListJson()
{
    if (G_IS_REFRESHING.exchange(true))
        return;

    if (setupESCAPI() == 0)
    {
        logConsole("SYSTEM", "ESCAPI init failed!");
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
    // Audio fake
    json_ss << "],\"audio\":[\"Microphone (Client-side)\"]}";

    {
        lock_guard<mutex> lock(G_DEVICE_LIST_MUTEX);
        G_DEVICE_LIST_JSON = json_ss.str();
    }
    G_IS_REFRESHING.store(false);
}

string DeviceController::getDevices(bool refresh)
{
    if (refresh)
    {
        if (!G_IS_REFRESHING.load())
            thread(buildDeviceListJson).detach();
        return "{\"video\":[],\"audio\":[], \"status\":\"refresh_pending\"}";
    }
    lock_guard<mutex> lock(G_DEVICE_LIST_MUTEX);
    return G_DEVICE_LIST_JSON;
}

// --- 2. STREAMING ---
void DeviceController::broadcastWorker(string camName)
{
    logConsole("CAM", "Bat dau luong camera: " + camName);

    if (setupESCAPI() == 0)
        return;

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

    SimpleCapParams capture;
    capture.mWidth = 640;
    capture.mHeight = 480;
    capture.mTargetBuf = new int[capture.mWidth * capture.mHeight];

    // Khoi tao camera
    initCapture(devIndex, &capture);

    while (isStreaming)
    {
        doCapture(devIndex);

        int timeout = 100;
        while (isCaptureDone(devIndex) == 0 && timeout-- > 0)
            Sleep(10);

        if (isCaptureDone(devIndex))
        {
            string jpgData = rawToJpeg(capture.mTargetBuf, capture.mWidth, capture.mHeight);

            lock_guard<mutex> lock(streamMutex);
            if (viewingClients.empty())
            {
                isStreaming = false;
                break;
            }

            for (auto it = viewingClients.begin(); it != viewingClients.end();)
            {
                if (!sendStreamFrame(*it, jpgData))
                {
                    closesocket(*it);
                    it = viewingClients.erase(it);
                }
                else
                {
                    ++it;
                }
            }
        }
        Sleep(30);
    }

    deinitCapture(devIndex);
    delete[] capture.mTargetBuf;
    logConsole("CAM", "Da dung luong camera.");
}

void DeviceController::handleStreamCam(SOCKET client, const string &clientIP, const string &cam, const string &audio)
{
    {
        lock_guard<mutex> lock(streamMutex);
        viewingClients.push_back(client);

        if (!isStreaming)
        {
            isStreaming = true;
            std::thread(&DeviceController::broadcastWorker, this, cam).detach();
        }
    } // Unlock mutex de thread khac chay

    // === QUAN TRONG: Vong lap giu ket noi ===
    // Neu khong co doan nay, ham se return ngay -> socket bi dong -> stream tat
    char dummy[10];
    while (true)
    {
        // Cho tin hieu tu client (Gateway). Neu Gateway ngat, recv tra ve <= 0
        if (recv(client, dummy, sizeof(dummy), 0) <= 0)
            break;
    }

    // Khi thoat vong lap, xoa client khoi danh sach xem
    {
        lock_guard<mutex> lock(streamMutex);
        auto it = std::find(viewingClients.begin(), viewingClients.end(), client);
        if (it != viewingClients.end())
        {
            viewingClients.erase(it);
        }
    }
}