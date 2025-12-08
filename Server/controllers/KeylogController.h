// controllers/KeylogController.h
#ifndef KEYLOGCONTROLLER_H
#define KEYLOGCONTROLLER_H

#include <string>

/**
 * @brief Xu ly logic cho tab "Bat phim" va quan ly luong keylogger
 */
class KeylogController
{
public:
    // Ham static de khoi chay luong
    static void startKeyLoggerThread();

    std::string getKeylog();
    void setKeylog(bool enabled);
};

#endif // KEYLOGCONTROLLER_H