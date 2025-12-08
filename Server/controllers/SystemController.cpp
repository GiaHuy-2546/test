// controllers/SystemController.cpp
#include "SystemController.h"
#include <cstdlib>   // cho system()
#include <windows.h> // <-- PHẢI CÓ DÒNG NÀY (dinh nghia DeleteFileA, GetModuleFileNameA, PathRemoveFileSpecA)
#include <shlwapi.h>
#include <string>

using namespace std;

string SystemController::powerCommand(const string &action)
{
    if (action == "shutdown")
        system("shutdown /s /t 5");
    else if (action == "restart")
        system("shutdown /r /t 5");
    else
        return "{\"ok\":false, \"error\":\"Unknown command\"}";

    return "{\"ok\":true}";
}
std::string SystemController::deleteTempFile(const std::string &urlPath)
{
    // urlPath la "/vid_20251117_193000.mp4"

    // 1. Kiem tra an toan
    if (urlPath.find("..") != string::npos ||
        urlPath.find("/vid_") != 0 ||
        urlPath.rfind(".mp4") != (urlPath.length() - 4))
    {
        return "{\"ok\":false, \"error\":\"Invalid temp file path\"}";
    }

    // === PHAN SUA LOI ===

    // 2. Xay dung duong dan file tuong doi (Relative Path)
    //    (Loai bo dau '/' o dau urlPath)
    //    Vi du: "public\vid_20251117_193000.mp4"
    //    Duong dan nay la CHINH XAC vi 'admin-panel.js' da set CWD cho 'server.exe'
    std::string filename = urlPath.substr(1); // "vid_..."
    std::string relativePath = "../public/" + filename;

    // 3. Thu xoa file (voi 5 lan thu neu bi khoa)
    int retries = 5;
    while (retries > 0)
    {
        if (DeleteFileA(relativePath.c_str()))
        {
            return "{\"ok\":true}"; // Xoa thanh cong
        }

        // Neu xoa that bai, kiem tra xem co phai do bi khoa file khong
        DWORD err = GetLastError();
        if (err == ERROR_SHARING_VIOLATION || err == ERROR_LOCK_VIOLATION)
        {
            // File dang bi khoa (do gateway.js), cho 100ms va thu lai
            retries--;
            Sleep(100);
            continue;
        }
        else
        {
            // Loi khac (vi du: file not found), bao loi ngay
            // (Day la loi da xay ra voi code 'absolute path' truoc do)
            return "{\"ok\":false, \"error\":\"Delete failed (File not found or other error)\"}";
        }
    }

    // Neu het 5 lan thu van bi khoa
    return "{\"ok\":false, \"error\":\"Delete failed (File locked by gateway.js)\"}";
}