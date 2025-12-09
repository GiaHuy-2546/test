// controllers/DeviceController.cpp (FINAL FIXED: COM INIT ADDED)
#include "DeviceController.h"
#include "../utils/helpers.h"
#include "../utils/logging.h"
#include "../utils/escapi.h"
#include <sstream>
#include <thread>
#include <algorithm>
#include <objbase.h> // Can thiet cho CoInitialize

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
    if (bmp.GetLastStatus() != Ok)
        return "";

    CLSID clsid;
    if (GetEncoderClsid(L"image/jpeg", &clsid) < 0)
        return "";

    ULONG quality = 75; // Chat luong 75
    EncoderParameters eps;
    eps.Count = 1;
    eps.Parameter[0].Guid = EncoderQuality;
    eps.Parameter[0].Type = EncoderParameterValueTypeLong;
    eps.Parameter[0].NumberOfValues = 1;
    eps.Parameter[0].Value = &quality;

    IStream *pStream = NULL;
    // QUAN TRONG: CreateStreamOnHGlobal can moi truong COM (CoInitialize)
    if (CreateStreamOnHGlobal(NULL, TRUE, &pStream) != S_OK)
        return "";

    if (bmp.Save(pStream, &clsid, &eps) != Ok)
    {
        pStream->Release();
        return "";
    }

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

HWAVEIN DeviceController::hWaveIn = NULL;
WAVEHDR DeviceController::waveHeaders[3];
char DeviceController::audioBuffers[3][1024];

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

// --- 2. STREAMING WORKER ---
void DeviceController::broadcastWorker(string camName)
{
    HRESULT hr = CoInitialize(NULL);
    if (FAILED(hr))
    {
        logConsole("CAM", "Loi CoInitialize! Stream khong the bat.");
        return;
    }

    logConsole("CAM", "Bat dau luong camera: " + camName);

    startAudioCapture();

    if (setupESCAPI() == 0)
    {
        stopAudioCapture(); // Nếu cam lỗi thì tắt luôn audio
        CoUninitialize();
        return;
    }

    int devIndex = 0;
    int count = countCaptureDevices();
    char nameBuf[256];

    bool found = false;
    for (int i = 0; i < count; i++)
    {
        getCaptureDeviceName(i, nameBuf, 256);
        if (camName.find(nameBuf) != string::npos)
        {
            devIndex = i;
            found = true;
            break;
        }
    }
    if (!found && count > 0)
        devIndex = 0;

    SimpleCapParams capture;
    capture.mWidth = 640;
    capture.mHeight = 480;
    capture.mTargetBuf = new int[capture.mWidth * capture.mHeight];

    // ESCAPI init
    initCapture(devIndex, &capture);

    while (isStreaming)
    {
        doCapture(devIndex);

        int timeout = 20; // 200ms timeout
        while (isCaptureDone(devIndex) == 0 && timeout-- > 0)
        {
            Sleep(10);
        }

        if (isCaptureDone(devIndex))
        {
            // Nen JPEG (Can COM)
            string jpgData = rawToJpeg(capture.mTargetBuf, capture.mWidth, capture.mHeight);

            if (!jpgData.empty())
            {
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
        }
        Sleep(30);
    }
    stopAudioCapture();
    deinitCapture(devIndex);
    delete[] capture.mTargetBuf;
    logConsole("CAM", "Da dung luong camera.");

    // Huy COM khi het luong
    CoUninitialize();
}

void CALLBACK DeviceController::AudioCallback(HWAVEIN hwi, UINT uMsg, DWORD_PTR dwInstance, DWORD_PTR dwParam1, DWORD_PTR dwParam2)
{
    // Khi driver âm thanh báo đã ghi đầy 1 buffer (WIM_DATA)
    if (uMsg == WIM_DATA)
    {
        WAVEHDR *pHeader = (WAVEHDR *)dwParam1;

        // Chỉ xử lý nếu đang Stream và có dữ liệu (BytesRecorded > 0)
        if (isStreaming && pHeader->dwBytesRecorded > 0)
        {
            std::lock_guard<std::mutex> lock(streamMutex);

            // Gói dữ liệu âm thanh thành chuỗi
            std::string audioData(pHeader->lpData, pHeader->dwBytesRecorded);

            // Gửi cho TẤT CẢ client đang xem
            for (auto it = viewingClients.begin(); it != viewingClients.end();)
            {
                // Gọi sendStreamFrame: Gateway sẽ chuyển tiếp gói này xuống Client
                // Client sẽ dựa vào kích thước gói tin (nhỏ < 2000 bytes) để biết đây là âm thanh
                if (!sendStreamFrame(*it, audioData))
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

        // Nếu vẫn đang stream, nạp lại buffer này để ghi tiếp (Vòng lặp)
        if (isStreaming)
        {
            waveInAddBuffer(hwi, pHeader, sizeof(WAVEHDR));
        }
    }
}

void DeviceController::startAudioCapture()
{
    WAVEFORMATEX format;
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = 1; // Mono (Nhẹ)
    format.nSamplesPerSec = 16000;
    format.wBitsPerSample = 16;
    format.nBlockAlign = format.nChannels * (format.wBitsPerSample / 8);
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
    format.cbSize = 0;

    // Mở thiết bị ghi âm mặc định (WAVE_MAPPER)
    MMRESULT result = waveInOpen(&hWaveIn, WAVE_MAPPER, &format, (DWORD_PTR)AudioCallback, 0, CALLBACK_FUNCTION);
    if (result != MMSYSERR_NOERROR)
    {
        logConsole("AUDIO", "Khong the mo Microphone. Ma loi: " + to_string(result));
        return;
    }

    // Chuẩn bị 3 buffer để ghi luân phiên (tránh mất tiếng)
    for (int i = 0; i < 3; i++)
    {
        memset(&waveHeaders[i], 0, sizeof(WAVEHDR));
        waveHeaders[i].lpData = audioBuffers[i];
        waveHeaders[i].dwBufferLength = 1024; // Buffer size
        waveInPrepareHeader(hWaveIn, &waveHeaders[i], sizeof(WAVEHDR));
        waveInAddBuffer(hWaveIn, &waveHeaders[i], sizeof(WAVEHDR));
    }

    waveInStart(hWaveIn);
    logConsole("AUDIO", "Da bat ghi am (11kHz, 8bit).");
}

void DeviceController::stopAudioCapture()
{
    if (hWaveIn)
    {
        waveInReset(hWaveIn); // Dừng ghi ngay lập tức
        waveInClose(hWaveIn); // Đóng thiết bị
        hWaveIn = NULL;
        logConsole("AUDIO", "Da tat ghi am.");
    }
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
    }

    // Loop giu ket noi
    char dummy[10];
    while (true)
    {
        if (recv(client, dummy, sizeof(dummy), 0) <= 0)
            break;
    }

    {
        lock_guard<mutex> lock(streamMutex);
        auto it = std::find(viewingClients.begin(), viewingClients.end(), client);
        if (it != viewingClients.end())
        {
            viewingClients.erase(it);
        }
    }
}