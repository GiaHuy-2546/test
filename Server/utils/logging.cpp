// utils/logging.cpp
#include "logging.h"
#include <iostream>
#include <ctime>

// Mutex de bao ve viec in ra console (cout)
// 'static' de bien nay chi duoc thay trong file .cpp nay
static std::mutex printMutex;

void logConsole(const std::string &clientInfo, const std::string &msg)
{
    std::lock_guard<std::mutex> lock(printMutex); // Khoa cout
    time_t now = time(0);
    char *dt = ctime(&now);
    std::string timeStr(dt);
    timeStr.pop_back(); // Xoa ky tu \n o cuoi
    std::cout << "[" << timeStr << "][" << clientInfo << "] " << msg << std::endl;
}