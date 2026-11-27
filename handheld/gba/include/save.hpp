#ifndef BARRELWING_SAVE_HPP
#define BARRELWING_SAVE_HPP

#include <cstdint>

namespace barrelwing
{
    struct save_data
    {
        uint32_t classic_best = 0;
        uint32_t gale_best = 0;
        uint32_t challenge_classic_best = 0;
        uint32_t challenge_gale_best = 0;
        uint32_t challenge_seed = 0;
        int challenge_class = 0;
        uint16_t sequence = 0;
        bool valid = false;
    };

    save_data load_save();
    void commit_save(save_data& data);
}

#endif
