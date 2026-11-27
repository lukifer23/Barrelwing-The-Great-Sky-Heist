#include "challenge.hpp"

namespace barrelwing
{
    namespace
    {
        constexpr const char alphabet[] = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        uint8_t crc8(uint32_t seed, int sprint_class)
        {
            uint8_t crc = 0xff;
            const uint8_t bytes[5] = {
                uint8_t(challenge_version), uint8_t(sprint_class),
                uint8_t(seed >> 16), uint8_t(seed >> 8), uint8_t(seed)
            };
            for(uint8_t byte : bytes)
            {
                crc ^= byte;
                for(int bit = 0; bit < 8; ++bit)
                {
                    crc = uint8_t((crc & 0x80) ? (crc << 1) ^ 0x07 : crc << 1);
                }
            }
            return crc;
        }

        int alphabet_index(char c)
        {
            for(int i = 0; i < 32; ++i)
            {
                if(alphabet[i] == c)
                {
                    return i;
                }
            }
            return -1;
        }
    }

    const char* challenge_alphabet()
    {
        return alphabet;
    }

    bool decode_challenge(const char* six_chars, challenge& result)
    {
        uint32_t bits = 0;
        for(int i = 0; i < 6; ++i)
        {
            const int value = alphabet_index(six_chars[i]);
            if(value < 0)
            {
                return false;
            }
            bits = (bits << 5) | uint32_t(value);
        }
        if((bits >> 30) != 0)
        {
            return false;
        }
        const uint32_t seed = (bits >> 10) & ((1u << challenge_seed_bits) - 1);
        const int sprint_class = int((bits >> 8) & 3);
        const uint8_t expected = uint8_t(bits & 0xff);
        if(sprint_class > 1 || crc8(seed, sprint_class) != expected)
        {
            return false;
        }
        result.seed = seed;
        result.sprint_class = sprint_class;
        result.valid = true;
        return true;
    }

    void encode_challenge(uint32_t seed, int sprint_class, char* six_chars)
    {
        seed &= (1u << challenge_seed_bits) - 1;
        uint32_t bits = (seed << 10) | (uint32_t(sprint_class & 3) << 8) | uint32_t(crc8(seed, sprint_class));
        for(int i = 5; i >= 0; --i)
        {
            six_chars[i] = alphabet[bits & 31];
            bits >>= 5;
        }
    }
}
