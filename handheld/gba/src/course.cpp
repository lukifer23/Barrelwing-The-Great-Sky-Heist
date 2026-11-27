#include "course.hpp"

namespace barrelwing
{
    course::course(uint32_t seed)
    {
        reset(seed);
    }

    void course::reset(uint32_t seed)
    {
        _rng = seed ? seed : 1;
        _next_x = 510;
        _last_gap_y = 132;
        _index = 0;
    }

    uint32_t course::_next_u32()
    {
        uint32_t x = _rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        _rng = x;
        return x;
    }

    int course::_range(int minimum, int maximum)
    {
        return minimum + int(_next_u32() % uint32_t(maximum - minimum + 1));
    }

    course_gate course::next(int speed, int elapsed_ms, int gap_min, int gap_max)
    {
        course_gate result;
        result.index = _index++;
        result.x = _next_x;
        result.gap_h = _range(gap_min, gap_max);

        const int min_y = course_min_gap_y + result.gap_h / 2;
        const int max_y = course_height - course_bottom_margin - result.gap_h / 2;
        result.gap_y = _last_gap_y + _range(-36, 36);
        if(result.gap_y < min_y)
        {
            result.gap_y = min_y;
        }
        else if(result.gap_y > max_y)
        {
            result.gap_y = max_y;
        }
        _last_gap_y = result.gap_y;

        result.has_acorns = _range(0, 99) < 70;
        if(result.has_acorns)
        {
            static constexpr int offsets[3] = { 0, 6, -6 };
            for(int i = 0; i < 3; ++i)
            {
                result.acorn_y[i] = result.gap_y + offsets[i];
            }
        }

        const int spacing_percent = 150 - (elapsed_ms / 2000 < 45 ? elapsed_ms / 2000 : 45);
        _next_x += speed * spacing_percent / 100;
        return result;
    }
}
