// controllers/ScreenController.h (PHIEN BAN HYBRID)
#ifndef SCREENCONTROLLER_H
#define SCREENCONTROLLER_H

#include <winsock2.h>
#include <string>
// (Xoa atomic, mutex)

class ScreenController
{
public:
    void handleScreenStream(SOCKET client, const std::string &clientIP);
    std::string getScreenshotBase64();

private:
    std::string captureScreenToRam();
};
#endif