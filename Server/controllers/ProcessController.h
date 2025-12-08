// controllers/ProcessController.h
#ifndef PROCESSCONTROLLER_H
#define PROCESSCONTROLLER_H

#include <string>
#include <windows.h> // Can cho DWORD

/**
 * @brief Xu ly logic cho tab "Tien trinh" (PID, Kill)
 */
class ProcessController
{
public:
    std::string getProcessesJson();
    std::string killProcess(const std::string &pid_str);

private:
    std::string listProcessesJson();
    bool killProcessByPid(DWORD pid);
};

#endif // PROCESSCONTROLLER_H