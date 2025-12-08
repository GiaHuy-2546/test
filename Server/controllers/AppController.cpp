// controllers/AppController.cpp
#include "../utils/helpers.h" // Can jsonEscape, getProcessPath
#include "AppController.h"
#include <sstream>
#include <shellapi.h> // cho ShellExecuteA
#include <stdexcept>  // cho stoll
#include <cstdint>

using namespace std;

// Struct de luu thong tin cua so ung dung
struct AppController::AppInfo
{
    HWND hwnd;
    DWORD pid;
    string title;
    string path;
};

/**
 * @brief Liet ke tat ca cac CUA SO ung dung dang mo (co giao dien).
 */
vector<AppController::AppInfo> AppController::listApplications()
{
    vector<AppInfo> out;
    EnumWindows([](HWND h, LPARAM l) -> BOOL
                {
        if (IsWindowVisible(h) && GetWindowTextLengthA(h) > 0) {
            char buf[256]; GetWindowTextA(h, buf, 256);
            DWORD pid; GetWindowThreadProcessId(h, &pid);
            string path = getProcessPath(pid);
            if (path.empty()) path = "Unknown";
            ((vector<AppInfo>*)l)->push_back({h, pid, string(buf), path});
        } return TRUE; }, (LPARAM)&out);
    return out;
}

/**
 * @brief Dong mot cua so ung dung bang "handle" (HWND) cua no.
 */
bool AppController::closeWindowByHwnd(HWND hwnd)
{
    if (!IsWindow(hwnd))
        return false;
    PostMessage(hwnd, WM_CLOSE, 0, 0);
    return true;
}

/**
 * @brief Mo mot ung dung/file bang ten lenh.
 */
bool AppController::startProcessFromCommand(const string &cmd)
{
    return ((intptr_t)ShellExecuteA(NULL, "open", cmd.c_str(), NULL, NULL, SW_SHOWNORMAL) > 32);
}
// --- Public Handlers (Tra ve JSON string) ---
string AppController::getAppsJson()
{
    auto apps = listApplications();
    stringstream ss;
    // --- SUA LOI: Khong them 'command' hay 'payload' ---
    ss << "[";
    for (size_t i = 0; i < apps.size(); ++i)
    {
        ss << (i ? "," : "") << "{\"hwnd\":" << (uint64_t)(uintptr_t)apps[i].hwnd
           << ",\"pid\":" << apps[i].pid
           << ",\"title\":\"" << jsonEscape(apps[i].title)
           << "\",\"path\":\"" << jsonEscape(apps[i].path) << "\"}";
    }
    ss << "]";
    return ss.str();
}

string AppController::closeApp(const string &hwnd_str)
{
    try
    {
        uint64_t id = stoll(hwnd_str);
        bool ok = closeWindowByHwnd((HWND)(uintptr_t)id);
        return ok ? "{\"ok\":true}" : "{\"ok\":false}";
    }
    catch (...)
    {
        return "{\"ok\":false, \"error\":\"Invalid HWND\"}";
    }
}

string AppController::startApp(const string &cmd)
{
    bool ok = !cmd.empty() && startProcessFromCommand(cmd);
    return ok ? "{\"ok\":true}" : "{\"ok\":false}";
}