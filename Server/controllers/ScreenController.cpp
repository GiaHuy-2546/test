// controllers/ScreenController.cpp (FIXED - FULL RESOLUTION)
#include "ScreenController.h"
#include "../utils/helpers.h"
#include "../utils/logging.h"
#include <sstream>
#include <thread>
#include <algorithm>
#include <objbase.h>
#include <iostream>
#include <fstream>
#include <ShellScalingApi.h>

#pragma comment(lib, "Shcore.lib")

using namespace Gdiplus;
using namespace std;

// --- Init Static Members ---
std::vector<SOCKET> ScreenController::viewingClients;
std::mutex ScreenController::streamMutex;
std::atomic<bool> ScreenController::isStreaming(false);

// --- 1. CORE: CHUP MAN HINH FULL RESOLUTION ---
string ScreenController::captureScreenToRam()
{
    // BAT DPI AWARENESS de lay kich thuoc THAT
    SetProcessDPIAware();
    
    // Lay kich thuoc MAN HINH THAT (khong bi scale)
    int w = GetSystemMetrics(SM_CXSCREEN);
    int h = GetSystemMetrics(SM_CYSCREEN);

    cout << "[SCREEN] Capture size: " << w << "x" << h << endl;

    // Lay DC cua man hinh
    HDC scrdc = GetDC(NULL);
    HDC memdc = CreateCompatibleDC(scrdc);
    HBITMAP bmp = CreateCompatibleBitmap(scrdc, w, h);
    
    if (!bmp) {
        cout << "[ERROR] Cannot create bitmap!" << endl;
        DeleteDC(memdc);
        ReleaseDC(NULL, scrdc);
        return "";
    }
    
    HGDIOBJ oldbmp = SelectObject(memdc, bmp);

    // CHUP MAN HINH - BitBlt voi SRCCOPY | CAPTUREBLT
    BOOL result = BitBlt(memdc, 0, 0, w, h, scrdc, 0, 0, SRCCOPY | CAPTUREBLT);
    
    if (!result) {
        cout << "[ERROR] BitBlt failed!" << endl;
    }

    // Ve con tro chuot
    CURSORINFO cursorInfo = {0};
    cursorInfo.cbSize = sizeof(CURSORINFO);
    if (GetCursorInfo(&cursorInfo) && cursorInfo.flags == CURSOR_SHOWING)
    {
        int cursorX = cursorInfo.ptScreenPos.x;
        int cursorY = cursorInfo.ptScreenPos.y;
        
        if (cursorX >= 0 && cursorX < w && cursorY >= 0 && cursorY < h)
        {
            DrawIconEx(memdc, cursorX, cursorY, cursorInfo.hCursor, 0, 0, 0, NULL, DI_NORMAL);
        }
    }

    // Khoi tao GDI+ Bitmap va Encoder
    Bitmap bitmap(bmp, NULL);
    CLSID clsid;
    GetEncoderClsid(L"image/jpeg", &clsid);

    // Cau hinh chat luong JPEG
    ULONG quality = 50;
    EncoderParameters eps;
    eps.Count = 1;
    eps.Parameter[0].Guid = EncoderQuality;
    eps.Parameter[0].Type = EncoderParameterValueTypeLong;
    eps.Parameter[0].NumberOfValues = 1;
    eps.Parameter[0].Value = &quality;

    // Luu vao IStream
    IStream *pStream = NULL;
    if (CreateStreamOnHGlobal(NULL, TRUE, &pStream) != S_OK)
    {
        SelectObject(memdc, oldbmp);
        DeleteObject(bmp);
        DeleteDC(memdc);
        ReleaseDC(NULL, scrdc);
        return "";
    }

    bitmap.Save(pStream, &clsid, &eps);

    // Doc du lieu tu Stream
    LARGE_INTEGER liZero = {};
    ULARGE_INTEGER pos = {};
    pStream->Seek(liZero, STREAM_SEEK_CUR, &pos);
    pStream->Seek(liZero, STREAM_SEEK_SET, NULL);

    string data;
    data.resize((size_t)pos.QuadPart);
    ULONG bytesRead = 0;
    pStream->Read(&data[0], (ULONG)pos.QuadPart, &bytesRead);

    pStream->Release();
    SelectObject(memdc, oldbmp);
    DeleteObject(bmp);
    DeleteDC(memdc);
    ReleaseDC(NULL, scrdc);

    return data;
}

//--- 2. PUBLIC: CHUP ANH TINH ---
std::string ScreenController::getScreenshotBase64()
{
    CoInitialize(NULL);
    string jpgData = captureScreenToRam();
    CoUninitialize();

    string base64Data = Base64Encode(jpgData);
    return "{\"payload\":\"" + base64Data + "\"}";
}

// --- 3. WORKER: LUONG BROADCAST ---
void ScreenController::broadcastWorker()
{
    HRESULT hr = CoInitialize(NULL);
    if (FAILED(hr))
    {
        logConsole("SCREEN", "Loi CoInitialize! Stream man hinh khong the chay.");
        return;
    }

    logConsole("SCREEN", "Bat dau luong Broadcast man hinh (1 -> N).");

    while (isStreaming)
    {
        string jpgData = captureScreenToRam();

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

        Sleep(33); // ~30 FPS
    }

    logConsole("SCREEN", "Da dung luong Broadcast man hinh.");
    CoUninitialize();
}

// --- 4. HANDLER: QUAN LY KET NOI CLIENT ---
void ScreenController::handleScreenStream(SOCKET client, const string &clientIP)
{
    {
        lock_guard<mutex> lock(streamMutex);
        viewingClients.push_back(client);

        if (!isStreaming)
        {
            isStreaming = true;
            std::thread(&ScreenController::broadcastWorker, this).detach();
        }
    }

    char dummy[10];
    while (true)
    {
        if (recv(client, dummy, sizeof(dummy), 0) <= 0)
            break;
    }

    {
        lock_guard<mutex> lock(streamMutex);
        auto it = find(viewingClients.begin(), viewingClients.end(), client);
        if (it != viewingClients.end())
        {
            viewingClients.erase(it);
        }
    }
}