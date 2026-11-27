#ifndef BARRELWING_CHALLENGE_HPP
#define BARRELWING_CHALLENGE_HPP

#include <cstdint>

namespace barrelwing
{
    constexpr int challenge_version = 1;
    constexpr int challenge_seed_bits = 20;

    struct challenge
    {
        uint32_t seed = 0;
        int sprint_class = 0;
        bool valid = false;
    };

    const char* challenge_alphabet();
    bool decode_challenge(const char* six_chars, challenge& result);
    void encode_challenge(uint32_t seed, int sprint_class, char* six_chars);
}

#endif
