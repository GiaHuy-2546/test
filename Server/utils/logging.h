// utils/logging.h
#ifndef LOGGING_H
#define LOGGING_H

#include <string>
#include <mutex>

/**
 * @brief Ghi log ra console mot cach an toan (tu nhieu luong).
 */
void logConsole(const std::string &clientInfo, const std::string &msg);

#endif // LOGGING_H