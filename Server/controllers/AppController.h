// controllers/AppController.h
#ifndef APPCONTROLLER_H
#define APPCONTROLLER_H

#include <string>
#include <vector>
#include <windows.h> // Can cho HWND

/**
 * @brief Xu ly logic cho tab "Ung dung" (HWND, Close, Start)
 */
class AppController
{
public:
    std::string getAppsJson();
    std::string closeApp(const std::string &hwnd_str);
    std::string startApp(const std::string &cmd);

private:
    struct AppInfo; // Dinh nghia nested struct trong .cpp
    std::vector<AppInfo> listApplications();
    bool closeWindowByHwnd(HWND hwnd);
    bool startProcessFromCommand(const std::string &cmd);
};

#endif // APPCONTROLLER_H