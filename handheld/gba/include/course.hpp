#ifndef BARRELWING_COURSE_HPP
#define BARRELWING_COURSE_HPP

#include <cstdint>

namespace barrelwing
{
    constexpr int course_version = 1;
    constexpr int course_width = 480;
    constexpr int course_height = 270;
    constexpr int course_min_gap_y = 50;
    constexpr int course_bottom_margin = 34;
    constexpr int course_gate_width = 34;

    struct course_gate
    {
        int index = 0;
        int x = 0;
        int gap_y = 0;
        int gap_h = 0;
        bool has_acorns = false;
        int acorn_y[3] = { 0, 0, 0 };
    };

    class course
    {
    public:
        explicit course(uint32_t seed = 1);

        void reset(uint32_t seed);
        course_gate next(int speed, int elapsed_ms, int gap_min, int gap_max);

    private:
        uint32_t _rng = 1;
        int _next_x = 510;
        int _last_gap_y = 132;
        int _index = 0;

        uint32_t _next_u32();
        int _range(int minimum, int maximum);
    };
}

#endif
