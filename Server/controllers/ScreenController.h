// controllers/ScreenController.h (BROADCAST VERSION)
#ifndef SCREENCONTROLLER_H
#define SCREENCONTROLLER_H

#include <winsock2.h>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>

class ScreenController
{
public:
    // Ham nay duoc goi tu CommandRouter khi co client moi
    void handleScreenStream(SOCKET client, const std::string &clientIP);

    // Ham chup anh tinh (cho tab Screen)
    std::string getScreenshotBase64();

private:
    std::string captureScreenToRam();

    // --- BROADCAST MEMBERS (Giong DeviceController) ---
    static std::vector<SOCKET> viewingClients; // Danh sach cac client dang xem
    static std::mutex streamMutex;             // Khoa bao ve danh sach
    static std::atomic<bool> isStreaming;      // Co bao hieu luong worker dang chay

    // Worker chay ngam: Chup 1 lan, gui cho tat ca
    void broadcastWorker();
};
#endif