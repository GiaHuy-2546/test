// controllers/SystemController.h
#ifndef SYSTEMCONTROLLER_H
#define SYSTEMCONTROLLER_H

#include <string>

/**
 * @brief Xu ly logic cho tab "He thong" (Shutdown, Restart)
 */
class SystemController
{
public:
    std::string powerCommand(const std::string &action);
    std::string deleteTempFile(const std::string &urlPath);
};

#endif // SYSTEMCONTROLLER_H