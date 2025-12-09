// controllers/ScreenController.cpp (BROADCAST VERSION)
#include "ScreenController.h"
#include "../utils/helpers.h"
#include "../utils/logging.h"
#include <sstream>
#include <thread>
#include <algorithm>
#include <objbase.h> // Can cho CoInitialize (CreateStreamOnHGlobal)

using namespace Gdiplus;
using namespace std;

// --- Init Static Members ---
std::vector<SOCKET> ScreenController::viewingClients;
std::mutex ScreenController::streamMutex;
std::atomic<bool> ScreenController::isStreaming(false);

// --- 1. CORE: CHUP MAN HINH (Giu nguyen logic cu) ---
string ScreenController::captureScreenToRam()
{
    // Lay kich thuoc man hinh ao (Virtual Screen)
    int x = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int y = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int h = GetSystemMetrics(SM_CYVIRTUALSCREEN);

    HDC scrdc = GetDC(NULL);
    HDC memdc = CreateCompatibleDC(scrdc);
    HBITMAP bmp = CreateCompatibleBitmap(scrdc, w, h);
    HGDIOBJ oldbmp = SelectObject(memdc, bmp);

    // Chup man hinh vao Bitmap
    BitBlt(memdc, 0, 0, w, h, scrdc, x, y, SRCCOPY | CAPTUREBLT);

    // Ve con tro chuot (Cursor)
    CURSORINFO cursorInfo = {0};
    cursorInfo.cbSize = sizeof(CURSORINFO);
    if (GetCursorInfo(&cursorInfo))
    {
        if (cursorInfo.flags == CURSOR_SHOWING)
        {
            int memCursorX = cursorInfo.ptScreenPos.x - x;
            int memCursorY = cursorInfo.ptScreenPos.y - y;
            DrawIcon(memdc, memCursorX, memCursorY, cursorInfo.hCursor);
        }
    }

    // Khoi tao GDI+ Bitmap va Encoder
    Bitmap bitmap(bmp, NULL);
    CLSID clsid;
    GetEncoderClsid(L"image/jpeg", &clsid);

    // Cau hinh chat luong JPEG (50% de toi uu toc do/bang thong)
    ULONG quality = 50;
    EncoderParameters eps;
    eps.Count = 1;
    eps.Parameter[0].Guid = EncoderQuality;
    eps.Parameter[0].Type = EncoderParameterValueTypeLong;
    eps.Parameter[0].NumberOfValues = 1;
    eps.Parameter[0].Value = &quality;

    // Luu vao IStream (Memory)
    IStream *pStream = NULL;
    if (CreateStreamOnHGlobal(NULL, TRUE, &pStream) != S_OK)
    {
        // Neu loi tao stream (thuong do chua init COM), don dep va return rong
        SelectObject(memdc, oldbmp);
        DeleteObject(bmp);
        DeleteDC(memdc);
        ReleaseDC(NULL, scrdc);
        return "";
    }

    bitmap.Save(pStream, &clsid, &eps);

    // Doc du lieu tu Stream ra string
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

// --- 2. PUBLIC: CHUP ANH TINH (Cho chuc nang Screenshot) ---
std::string ScreenController::getScreenshotBase64()
{
    // Can init COM cuc bo vi ham nay chay tren luong Command (9000)
    // CoInitialize duoc goi an toan (S_OK hoac S_FALSE)
    CoInitialize(NULL);
    string jpgData = captureScreenToRam();
    CoUninitialize();

    string base64Data = Base64Encode(jpgData);
    return "{\"payload\":\"" + base64Data + "\"}";
}

// --- 3. WORKER: LUONG BROADCAST (1 Capture -> N Clients) ---
void ScreenController::broadcastWorker()
{
    // QUAN TRONG: CreateStreamOnHGlobal can moi truong COM
    HRESULT hr = CoInitialize(NULL);
    if (FAILED(hr))
    {
        logConsole("SCREEN", "Loi CoInitialize! Stream man hinh khong the chay.");
        return;
    }

    logConsole("SCREEN", "Bat dau luong Broadcast man hinh (1 -> N).");

    while (isStreaming)
    {
        // A. Chup va Nen (Chi lam 1 lan)
        string jpgData = captureScreenToRam();

        if (!jpgData.empty())
        {
            // B. Gui cho danh sach client
            lock_guard<mutex> lock(streamMutex);

            if (viewingClients.empty())
            {
                isStreaming = false; // Khong con ai xem thi dung luong
                break;
            }

            for (auto it = viewingClients.begin(); it != viewingClients.end();)
            {
                // Gui frame (4 byte size + data)
                if (!sendStreamFrame(*it, jpgData))
                {
                    // Neu loi gui -> Client da ngat -> Xoa khoi list
                    closesocket(*it);
                    it = viewingClients.erase(it);
                }
                else
                {
                    ++it;
                }
            }
        }

        // C. Gioi han FPS (~30 FPS)
        Sleep(33);
    }

    logConsole("SCREEN", "Da dung luong Broadcast man hinh.");
    CoUninitialize(); // Don dep COM
}

// --- 4. HANDLER: QUAN LY KET NOI CLIENT ---
void ScreenController::handleScreenStream(SOCKET client, const string &clientIP)
{
    {
        lock_guard<mutex> lock(streamMutex);
        viewingClients.push_back(client);

        // Neu luong worker chua chay thi bat no len
        if (!isStreaming)
        {
            isStreaming = true;
            std::thread(&ScreenController::broadcastWorker, this).detach();
        }
    }

    // Vong lap giu ket noi (Blocking)
    // De server biet khi nao client ngat ket noi ma xoa khoi list
    char dummy[10];
    while (true)
    {
        // recv se block cho den khi co du lieu hoac disconnect
        if (recv(client, dummy, sizeof(dummy), 0) <= 0)
            break;
    }

    // Khi client ngat ket noi (thoat khoi vong lap tren)
    {
        lock_guard<mutex> lock(streamMutex);
        auto it = find(viewingClients.begin(), viewingClients.end(), client);
        if (it != viewingClients.end())
        {
            viewingClients.erase(it);
        }
    }
}