// controllers/SystemController.cpp
#include "SystemController.h"
#include <cstdlib>
#include <windows.h>
#include <shlwapi.h>
#include <string>
#include <iostream>
#include <vector>
#include <algorithm> // Để dùng replace
#include <sstream>   // Để parse số an toàn

using namespace std;

// --- 1. Giữ nguyên các hàm cũ ---
string SystemController::powerCommand(const string &action)
{
    if (action == "shutdown") system("shutdown /s /t 5");
    else if (action == "restart") system("shutdown /r /t 5");
    else return "{\"ok\":false, \"error\":\"Unknown command\"}";
    return "{\"ok\":true}";
}

std::string SystemController::deleteTempFile(const std::string &urlPath)
{
    // (Giữ nguyên logic xóa file cũ của bạn...)
    if (urlPath.find("..") != string::npos) return "{\"ok\":false}";
    string filename = urlPath.substr(1);
    string relativePath = "../public/" + filename;
    DeleteFileA(relativePath.c_str());
    return "{\"ok\":true}";
}

// --- 2. HÀM XỬ LÝ INPUT (ĐÃ NÂNG CẤP DEBUG & FIX LOCALE) ---
void SystemController::handleInput(string type, string cmd, string p1, string p2)
{
    // [DEBUG] In ra lệnh nhận được để kiểm tra
    // cout << "[DEBUG] Input: " << type << " | " << cmd << " | " << p1 << " | " << p2 << endl;

    INPUT input = {0};

    try {
        if (type == "MOUSE")
        {
            if (cmd == "move")
            {
                // [FIX LOCALE] Thay thế dấu phẩy thành dấu chấm để tránh lỗi trên máy VN
                replace(p1.begin(), p1.end(), ',', '.');
                replace(p2.begin(), p2.end(), ',', '.');

                // Dùng stringstream để chuyển số an toàn hơn stod
                stringstream ss1(p1); ss1.imbue(locale::classic());
                double x; ss1 >> x;

                stringstream ss2(p2); ss2.imbue(locale::classic());
                double y; ss2 >> y;

                // Windows yêu cầu tọa độ 0-65535
                input.type = INPUT_MOUSE;
                input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
                input.mi.dx = (LONG)(x * 65535.0);
                input.mi.dy = (LONG)(y * 65535.0);
                
                // Thực hiện lệnh
                if (SendInput(1, &input, sizeof(INPUT)) == 0) {
                    cout << "[LOI] SendInput that bai! (Can chay Server quyen Admin?)" << endl;
                }
            }
            else if (cmd == "down" || cmd == "up")
            {
                int btn = stoi(p1);
                input.type = INPUT_MOUSE;
                
                if (btn == 0) // Trai
                    input.mi.dwFlags = (cmd == "down") ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
                else if (btn == 1) // Giua
                    input.mi.dwFlags = (cmd == "down") ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
                else if (btn == 2) // Phai
                    input.mi.dwFlags = (cmd == "down") ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                    
                SendInput(1, &input, sizeof(INPUT));
                // cout << "[MOUSE] Click " << (cmd == "down" ? "DOWN" : "UP") << " Btn: " << btn << endl;
            }
        }
        else if (type == "KEY")
        {
            int key = stoi(p1);
            input.type = INPUT_KEYBOARD;
            input.ki.wVk = (WORD)key;
            
            if (cmd == "up") input.ki.dwFlags = KEYEVENTF_KEYUP;
            // cmd="down" -> dwFlags=0

            SendInput(1, &input, sizeof(INPUT));
            // cout << "[KEY] " << key << " " << cmd << endl;
        }
    } catch (const exception& e) {
        cout << "[LOI EXCEPTION] " << e.what() << endl;
    } catch (...) {
        cout << "[LOI] Loi khong xac dinh khi xu ly Input" << endl;
    }
}