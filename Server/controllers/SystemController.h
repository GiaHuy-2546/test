// controllers/SystemController.h
#ifndef SYSTEMCONTROLLER_H
#define SYSTEMCONTROLLER_H

#include <string>

/**
 * @brief Xu ly logic cho tab "He thong" (Shutdown, Restart) va input
 */
class SystemController
{
public:
    // Ham cu: Xu ly Shutdown/Restart
    std::string powerCommand(const std::string &action);

    // Ham cu: Xoa file tam (video)
    std::string deleteTempFile(const std::string &urlPath);

    // [MỚI] Ham xu ly Input (Chuot, Ban phim) - THEM DONG NAY VÀO
    void handleInput(std::string type, std::string arg1, std::string arg2, std::string arg3);
};

#endif // SYSTEMCONTROLLER_H