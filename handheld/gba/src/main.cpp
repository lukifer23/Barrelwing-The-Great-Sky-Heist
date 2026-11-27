#include "bn_core.h"
#include "bn_array.h"
#include "bn_optional.h"
#include "bn_vector.h"
#include "bn_keypad.h"
#include "bn_math.h"
#include "bn_random.h"
#include "bn_string.h"
#include "bn_format.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_affine_mat_ptr.h"
#include "bn_sprite_text_generator.h"
#include "bn_regular_bg_ptr.h"
#include "bn_bg_palettes.h"
#include "bn_colors.h"
#include "bn_music.h"
#include "bn_music_items.h"
#include "bn_sound_items.h"

#include "bn_sprite_items_pip.h"
#include "bn_sprite_items_acorn.h"
#include "bn_sprite_items_storm_fill.h"
#include "bn_sprite_items_ui_heart.h"
#include "bn_regular_bg_items_bg_storm_sky.h"
#include "bn_regular_bg_items_bg_storm_mid.h"
#include "bn_regular_bg_items_bg_storm_trees.h"
#include "bn_regular_bg_items_bg_clouds.h"

#include "common_variable_8x16_sprite_font.h"

#include "challenge.hpp"
#include "course.hpp"
#include "save.hpp"

namespace
{
    using namespace barrelwing;

    constexpr int screen_width = 240;
    constexpr int screen_height = 160;
    constexpr int playfield_top = 25;
    constexpr int playfield_bottom = 160;
    constexpr int player_x = 112;
    constexpr int player_min_y = 80;
    constexpr int player_max_y = 236;
    constexpr int gate_pool = 8;
    constexpr int acorn_pool = gate_pool * 3;

    constexpr int physics_gravity = 620;
    constexpr int flap_impulse = -214;
    constexpr int flap_cooldown_ms = 150;
    constexpr int max_fall = 420;

    struct sprint_class
    {
        const char* label;
        int hearts;
        int speed;
        int top_speed;
        int gap_min;
        int gap_max;
    };

    constexpr sprint_class classes[2] = {
        { "CLASSIC", 3, 110, 195, 56, 78 },
        { "GALE", 1, 145, 215, 50, 62 },
    };

    enum class state
    {
        title,
        code_entry,
        ready,
        playing,
        paused,
        over,
    };

    struct gate_runtime
    {
        bn::fixed x;
        int gap_y = 0;
        int gap_h = 0;
        bool has_acorns = false;
        bool taken[3] = { false, false, false };
        int acorn_y[3] = { 0, 0, 0 };
    };

    state current_state = state::title;
    bn::random system_random;
    save_data saved;
    course sprint_course;

    sprint_class current_class = classes[0];
    int class_index = 0;
    bool challenge_mode = false;
    uint32_t run_seed = 0;

    bn::fixed player_y = 132;
    bn::fixed player_velocity = 0;
    int hearts = 3;
    int invulnerable_ms = 0;
    int last_flap_ms = -1000;
    int elapsed_ms = 0;
    int score = 0;
    int acorn_score = 0;
    bn::fixed distance = 0;
    int ready_frames = 0;
    int frame_counter = 0;
    int last_hud_score = -1;
    int last_hud_distance = -1;
    int last_hud_hearts = -1;

    gate_runtime gates[gate_pool];
    int gate_count = 0;

    char code_chars[6] = { '0', '0', '0', '0', '0', '0' };
    int code_cursor = 0;
    bool code_error = false;
    int code_repeat = 0;

    bn::optional<bn::sprite_ptr> pip;
    bn::vector<bn::sprite_ptr, acorn_pool> acorn_sprites;
    bn::vector<bn::sprite_ptr, gate_pool> gate_tops;
    bn::vector<bn::sprite_ptr, gate_pool> gate_bottoms;
    bn::vector<bn::sprite_ptr, 3> heart_sprites;
    bn::optional<bn::sprite_affine_mat_ptr> acorn_scale;

    bn::optional<bn::regular_bg_ptr> sky_bg;
    bn::optional<bn::regular_bg_ptr> mid_bg;
    bn::optional<bn::regular_bg_ptr> tree_bg;
    bn::optional<bn::regular_bg_ptr> cloud_bg;

    bn::sprite_text_generator text_generator(common::variable_8x16_sprite_font);
    bn::vector<bn::sprite_ptr, 128> text_sprites;

    int screen_x(bn::fixed world_x)
    {
        return (world_x / 2).round_integer();
    }

    int screen_y(int world_y)
    {
        return playfield_top + world_y / 2;
    }

    int speed_for_elapsed()
    {
        const int value = current_class.speed + elapsed_ms / 900;
        return value < current_class.top_speed ? value : current_class.top_speed;
    }

    void refresh_heart_visibility()
    {
        for(int i = 0; i < 3; ++i)
        {
            heart_sprites[i].set_visible(current_state == state::playing || current_state == state::paused || current_state == state::ready ? i < hearts : false);
        }
    }

    void set_game_sprites_visible(bool visible)
    {
        pip->set_visible(visible);
        for(int i = 0; i < gate_pool; ++i)
        {
            gate_tops[i].set_visible(visible);
            gate_bottoms[i].set_visible(visible);
        }
        for(int i = 0; i < acorn_pool; ++i)
        {
            acorn_sprites[i].set_visible(visible);
        }
        for(int i = 0; i < 3; ++i)
        {
            heart_sprites[i].set_visible(visible && i < hearts);
        }
    }

    void hide_all_game_sprites()
    {
        set_game_sprites_visible(false);
    }

    void write_text(const bn::string_view& line, int y)
    {
        text_generator.generate(0, y, line, text_sprites);
    }

    void render_title()
    {
        pip->set_visible(true);
        pip->set_position(0, 18);
        text_sprites.clear();
        text_generator.set_center_alignment();
        write_text("BARRELWING", -66);
        write_text("SKY SPRINT", -50);
        write_text("THE GREAT SKY HEIST", -36);
        bn::string<32> class_line;
        class_line.append("<  ");
        class_line.append(current_class.label);
        class_line.append("  >");
        write_text(class_line, -14);
        write_text("A / START  LAUNCH", 2);
        write_text("B  FAMILY CHALLENGE", 18);
        write_text("DPAD  CHOOSE CLASS", 34);
        write_text("BEST " + bn::to_string<16>(saved.classic_best) + " / " + bn::to_string<16>(saved.gale_best), 54);
        write_text("START PAUSES", 70);
    }

    void render_code_entry()
    {
        text_sprites.clear();
        text_generator.set_center_alignment();
        write_text("FAMILY CHALLENGE", -66);
        write_text("ENTER SHORT CODE", -50);
        bn::string<16> code;
        code.append("BW1-");
        for(int i = 0; i < 6; ++i)
        {
            code.append(code_chars[i]);
        }
        write_text(code, -22);
        write_text("CHAR " + bn::to_string<4>(code_cursor + 1) + " / 6", 0);
        write_text("UP/DOWN LETTER", 20);
        write_text("LEFT/RIGHT MOVE", 36);
        write_text("A CONFIRM   B BACK", 52);
        if(code_error)
        {
            write_text("INVALID CODE", 70);
        }
    }

    void render_ready()
    {
        text_sprites.clear();
        text_generator.set_center_alignment();
        write_text(current_class.label, -54);
        write_text(challenge_mode ? "FAMILY CHALLENGE" : "READY", -34);
        write_text("A / START  TAP TO RISE", 12);
        write_text("RELEASE TO FALL", 30);
    }

    void render_pause()
    {
        text_sprites.clear();
        text_generator.set_center_alignment();
        write_text("PAUSED", -40);
        write_text("A / START  RESUME", 0);
        write_text("B  TITLE", 18);
    }

    void render_over()
    {
        text_sprites.clear();
        text_generator.set_center_alignment();
        write_text(challenge_mode ? "CHALLENGE OVER" : "SPRINT OVER", -66);
        write_text(current_class.label, -48);
        write_text("SCORE " + bn::to_string<16>(score), -26);
        write_text("DISTANCE " + bn::to_string<16>(distance.round_integer()) + "m", -10);
        const uint32_t best = challenge_mode
            ? (current_class.label[0] == 'C' ? saved.challenge_classic_best : saved.challenge_gale_best)
            : (current_class.label[0] == 'C' ? saved.classic_best : saved.gale_best);
        write_text("BEST " + bn::to_string<16>(best), 8);
        write_text("A  PLAY AGAIN", 32);
        write_text("B  TITLE", 50);
    }

    void render_hud()
    {
        text_sprites.clear();
        text_generator.set_left_alignment();
        text_generator.generate(-112, -72, "SCORE " + bn::to_string<16>(score), text_sprites);
        text_generator.set_right_alignment();
        const uint32_t best = challenge_mode
            ? (current_class.label[0] == 'C' ? saved.challenge_classic_best : saved.challenge_gale_best)
            : (current_class.label[0] == 'C' ? saved.classic_best : saved.gale_best);
        text_generator.generate(112, -72, "BEST " + bn::to_string<16>(best), text_sprites);
        text_generator.set_center_alignment();
        text_generator.generate(0, -72, current_class.label, text_sprites);
        text_generator.set_left_alignment();
        text_generator.generate(-112, 72, bn::to_string<16>(distance.round_integer()) + "m", text_sprites);
    }

    void reset_run(bool challenge, uint32_t seed, int selected_class)
    {
        challenge_mode = challenge;
        run_seed = seed;
        class_index = selected_class;
        current_class = classes[class_index];
        sprint_course.reset(seed);
        player_y = 132;
        player_velocity = 0;
        hearts = current_class.hearts;
        invulnerable_ms = 0;
        last_flap_ms = -1000;
        elapsed_ms = 0;
        score = 0;
        acorn_score = 0;
        distance = 0;
        ready_frames = 0;
        frame_counter = 0;
        gate_count = 0;
        last_hud_score = -1;
        last_hud_distance = -1;
        last_hud_hearts = -1;
        for(int i = 0; i < gate_pool; ++i)
        {
            gates[i] = gate_runtime();
        }
        current_state = state::ready;
        set_game_sprites_visible(true);
        pip->set_position(screen_x(bn::fixed(player_x)), screen_y(132) - 9);
        pip->set_tiles(bn::sprite_items::pip.tiles_item(), 0);
        refresh_heart_visibility();
        render_ready();
    }

    void spawn_gate()
    {
        if(gate_count >= gate_pool)
        {
            return;
        }
        const int speed = speed_for_elapsed();
        const course_gate next = sprint_course.next(speed, elapsed_ms, current_class.gap_min, current_class.gap_max);
        gate_runtime& gate = gates[gate_count++];
        gate.x = bn::fixed(next.x);
        gate.gap_y = next.gap_y;
        gate.gap_h = next.gap_h;
        gate.has_acorns = next.has_acorns;
        for(int i = 0; i < 3; ++i)
        {
            gate.acorn_y[i] = next.acorn_y[i];
            gate.taken[i] = false;
        }
    }

    void ensure_gates()
    {
        while(gate_count < gate_pool && (gate_count == 0 || gates[gate_count - 1].x < bn::fixed(620)))
        {
            spawn_gate();
        }
    }

    void remove_offscreen_gates()
    {
        int write = 0;
        for(int read = 0; read < gate_count; ++read)
        {
            if(gates[read].x > bn::fixed(-50))
            {
                if(write != read)
                {
                    gates[write] = gates[read];
                }
                ++write;
            }
        }
        gate_count = write;
    }

    void update_gate_visuals()
    {
        for(int i = 0; i < gate_pool; ++i)
        {
            if(i >= gate_count)
            {
                gate_tops[i].set_visible(false);
                gate_bottoms[i].set_visible(false);
                for(int j = 0; j < 3; ++j)
                {
                    acorn_sprites[i * 3 + j].set_visible(false);
                }
                continue;
            }
            const gate_runtime& gate = gates[i];
            const int x = screen_x(gate.x);
            const int top_height = gate.gap_y - gate.gap_h / 2;
            const int gap_bottom = gate.gap_y + gate.gap_h / 2;
            const int bottom_height = course_height - gap_bottom;
            const bool visible = x > -30 && x < screen_width + 30;
            gate_tops[i].set_visible(visible && top_height > 0);
            gate_bottoms[i].set_visible(visible && bottom_height > 0);
            if(top_height > 0)
            {
                gate_tops[i].set_position(x, screen_y(top_height / 2));
                gate_tops[i].set_scale(bn::fixed(17) / 16, bn::fixed(top_height) / 32);
            }
            if(bottom_height > 0)
            {
                gate_bottoms[i].set_position(x, screen_y(gap_bottom + bottom_height / 2));
                gate_bottoms[i].set_scale(bn::fixed(17) / 16, bn::fixed(bottom_height) / 32);
            }
            for(int j = 0; j < 3; ++j)
            {
                const int acorn_x = (gate.x - 30 - j * 22).round_integer();
                const int acorn_screen_x = screen_x(bn::fixed(acorn_x));
                const bool show = visible && gate.has_acorns && !gate.taken[j] && acorn_screen_x > -12 && acorn_screen_x < screen_width + 12;
                acorn_sprites[i * 3 + j].set_visible(show);
                if(show)
                {
                    acorn_sprites[i * 3 + j].set_position(acorn_screen_x, screen_y(gate.acorn_y[j]));
                }
            }
        }
    }

    void update_hud()
    {
        if(last_hud_score != score || last_hud_distance != distance.round_integer() || last_hud_hearts != hearts)
        {
            last_hud_score = score;
            last_hud_distance = distance.round_integer();
            last_hud_hearts = hearts;
            render_hud();
            refresh_heart_visibility();
        }
    }

    void update_backgrounds()
    {
        sky_bg->set_x(-distance * bn::fixed(0.015));
        cloud_bg->set_x(-distance * bn::fixed(0.05));
        mid_bg->set_x(-distance * bn::fixed(0.09));
        tree_bg->set_x(-distance * bn::fixed(0.16));
    }

    void finish_run()
    {
        current_state = state::over;
        bn::music::stop();
        if(challenge_mode)
        {
            if(class_index == 0 && uint32_t(score) > saved.challenge_classic_best)
            {
                saved.challenge_classic_best = uint32_t(score);
            }
            else if(class_index == 1 && uint32_t(score) > saved.challenge_gale_best)
            {
                saved.challenge_gale_best = uint32_t(score);
            }
            saved.challenge_seed = run_seed;
            saved.challenge_class = class_index;
        }
        else
        {
            if(class_index == 0 && uint32_t(score) > saved.classic_best)
            {
                saved.classic_best = uint32_t(score);
            }
            else if(class_index == 1 && uint32_t(score) > saved.gale_best)
            {
                saved.gale_best = uint32_t(score);
            }
        }
        commit_save(saved);
        render_over();
    }

    void hit_player()
    {
        if(invulnerable_ms > 0)
        {
            return;
        }
        --hearts;
        invulnerable_ms = 1200;
        bn::sound_items::hurt.play(0.6);
        refresh_heart_visibility();
        if(hearts <= 0)
        {
            finish_run();
        }
    }

    void update_playing()
    {
        const int speed = speed_for_elapsed();
        const bn::fixed frame = bn::fixed(1) / 60;
        elapsed_ms += 16;
        distance += bn::fixed(speed) * frame;
        player_velocity += bn::fixed(physics_gravity) * frame;
        if(player_velocity > bn::fixed(max_fall))
        {
            player_velocity = bn::fixed(max_fall);
        }
        if(bn::keypad::a_pressed() && elapsed_ms - last_flap_ms >= flap_cooldown_ms)
        {
            player_velocity += bn::fixed(flap_impulse);
            if(player_velocity < bn::fixed(-250))
            {
                player_velocity = bn::fixed(-250);
            }
            last_flap_ms = elapsed_ms;
            bn::sound_items::flap.play(0.45);
        }
        player_y += player_velocity * frame;
        if(player_y < bn::fixed(player_min_y))
        {
            player_y = bn::fixed(player_min_y);
            player_velocity = 0;
        }
        else if(player_y > bn::fixed(player_max_y))
        {
            player_y = bn::fixed(player_max_y);
            player_velocity = 0;
        }
        if(invulnerable_ms > 0)
        {
            invulnerable_ms -= 16;
        }

        const int player_int_y = player_y.round_integer();
        for(int i = 0; i < gate_count; ++i)
        {
            gate_runtime& gate = gates[i];
            gate.x -= bn::fixed(speed) * frame;
            const int gate_x = gate.x.round_integer();
            if(gate_x > 88 && gate_x < 136)
            {
                const int gap_top = gate.gap_y - gate.gap_h / 2;
                const int gap_bottom = gate.gap_y + gate.gap_h / 2;
                if(player_int_y - 24 + 3 < gap_top - 3 || player_int_y - 3 > gap_bottom + 3)
                {
                    hit_player();
                }
            }
            if(gate.has_acorns)
            {
                for(int j = 0; j < 3; ++j)
                {
                    if(gate.taken[j])
                    {
                        continue;
                    }
                    const int acorn_x = (gate.x - 30 - j * 22).round_integer();
                    if(acorn_x > 100 && acorn_x < 124 && gate.acorn_y[j] > player_int_y - 26 && gate.acorn_y[j] < player_int_y + 2)
                    {
                        gate.taken[j] = true;
                        acorn_score += 25;
                        bn::sound_items::coin.play(0.35);
                    }
                }
            }
        }
        remove_offscreen_gates();
        ensure_gates();
        score = distance.round_integer() / 6 + acorn_score;
        frame_counter++;
        pip->set_position(screen_x(bn::fixed(player_x)), screen_y(player_int_y) - 9);
        if(invulnerable_ms > 0 && (frame_counter / 4) % 2 == 0)
        {
            pip->set_visible(false);
        }
        else
        {
            pip->set_visible(true);
        }
        if(elapsed_ms - last_flap_ms < 140)
        {
            pip->set_tiles(bn::sprite_items::pip.tiles_item(), 14);
        }
        else if(invulnerable_ms > 0)
        {
            pip->set_tiles(bn::sprite_items::pip.tiles_item(), 18 + (frame_counter / 8) % 2);
        }
        else
        {
            pip->set_tiles(bn::sprite_items::pip.tiles_item(), 8 + (frame_counter / 5) % 6);
        }
        update_gate_visuals();
        update_backgrounds();
        update_hud();
    }

    void start_challenge(const challenge& code)
    {
        challenge_mode = true;
        reset_run(true, code.seed, code.sprint_class);
        bn::music_items::sprint_loop.play(0.4);
    }

    void update_code_entry()
    {
        int step = 0;
        if(bn::keypad::up_pressed())
        {
            step = 1; code_repeat = 0;
        }
        else if(bn::keypad::down_pressed())
        {
            step = -1; code_repeat = 0;
        }
        else if(bn::keypad::up_held() || bn::keypad::down_held())
        {
            ++code_repeat;
            if(code_repeat > 12 && code_repeat % 4 == 0)
            {
                step = bn::keypad::up_held() ? 1 : -1;
            }
        }
        else
        {
            code_repeat = 0;
        }
        if(step != 0)
        {
            const char* alphabet = challenge_alphabet();
            int index = 0;
            while(alphabet[index] && alphabet[index] != code_chars[code_cursor])
            {
                ++index;
            }
            index = (index + step + 32) % 32;
            code_chars[code_cursor] = alphabet[index];
            code_error = false;
            render_code_entry();
        }
        if(bn::keypad::left_pressed())
        {
            code_cursor = code_cursor > 0 ? code_cursor - 1 : 5;
            render_code_entry();
        }
        else if(bn::keypad::right_pressed())
        {
            code_cursor = (code_cursor + 1) % 6;
            render_code_entry();
        }
        if(bn::keypad::a_pressed())
        {
            if(code_cursor < 5)
            {
                code_cursor++;
                code_error = false;
                render_code_entry();
            }
            else
            {
                challenge code;
                if(decode_challenge(code_chars, code))
                {
                    start_challenge(code);
                }
                else
                {
                    code_error = true;
                    bn::sound_items::defeat.play(0.5);
                    render_code_entry();
                }
            }
        }
        else if(bn::keypad::b_pressed() || bn::keypad::start_pressed())
        {
            current_state = state::title;
            render_title();
        }
    }

    void begin_normal()
    {
        uint32_t seed = system_random.get();
        if(seed == 0)
        {
            seed = 1;
        }
        reset_run(false, seed, class_index);
        bn::music_items::sprint_loop.play(0.4);
    }

    void handle_title()
    {
        if(bn::keypad::left_pressed() || bn::keypad::right_pressed())
        {
            class_index = 1 - class_index;
            current_class = classes[class_index];
            bn::sound_items::ui_confirm.play(0.3);
            render_title();
        }
        if(bn::keypad::a_pressed() || bn::keypad::start_pressed())
        {
            begin_normal();
        }
        else if(bn::keypad::b_pressed())
        {
            current_state = state::code_entry;
            code_cursor = 0;
            code_error = false;
            render_code_entry();
        }
    }

    void handle_ready()
    {
        ++ready_frames;
        if(ready_frames > 60 || bn::keypad::a_pressed() || bn::keypad::start_pressed())
        {
            current_state = state::playing;
            text_sprites.clear();
            ensure_gates();
            render_hud();
            refresh_heart_visibility();
        }
    }

    void handle_playing()
    {
        if(bn::keypad::start_pressed())
        {
            current_state = state::paused;
            bn::music::pause();
            render_pause();
            return;
        }
        update_playing();
    }

    void handle_paused()
    {
        if(bn::keypad::a_pressed() || bn::keypad::start_pressed())
        {
            current_state = state::playing;
            bn::music::resume();
            text_sprites.clear();
            render_hud();
            refresh_heart_visibility();
        }
        else if(bn::keypad::b_pressed())
        {
            bn::music::stop();
            current_state = state::title;
            hide_all_game_sprites();
            render_title();
        }
    }

    void handle_over()
    {
        if(bn::keypad::a_pressed() || bn::keypad::start_pressed())
        {
            reset_run(challenge_mode, run_seed, class_index);
            bn::music_items::sprint_loop.play(0.4);
        }
        else if(bn::keypad::b_pressed())
        {
            current_state = state::title;
            hide_all_game_sprites();
            render_title();
        }
    }
}

int main()
{
    bn::core::init();
    bn::bg_palettes::set_transparent_color(bn::color(0, 0, 0));
    bn::music::set_volume(0.35);

    saved = load_save();
    current_class = classes[0];

    pip = bn::sprite_items::pip.create_sprite(0, 0);
    acorn_scale = bn::sprite_affine_mat_ptr::create();
    sky_bg = bn::regular_bg_items::bg_storm_sky.create_bg(0, 0);
    mid_bg = bn::regular_bg_items::bg_storm_mid.create_bg(0, 0);
    tree_bg = bn::regular_bg_items::bg_storm_trees.create_bg(0, 0);
    cloud_bg = bn::regular_bg_items::bg_clouds.create_bg(0, 0);

    pip->set_scale(0.5);
    for(int i = 0; i < 3; ++i)
    {
        heart_sprites.push_back(bn::sprite_items::ui_heart.create_sprite(-108 + i * 14, -70));
        heart_sprites[i].set_scale(0.55);
    }
    acorn_scale->set_scale(0.5, 0.5);
    for(int i = 0; i < acorn_pool; ++i)
    {
        acorn_sprites.push_back(bn::sprite_items::acorn.create_sprite(0, 0));
        acorn_sprites[i].set_affine_mat(*acorn_scale);
        acorn_sprites[i].set_visible(false);
    }
    for(int i = 0; i < gate_pool; ++i)
    {
        gate_tops.push_back(bn::sprite_items::storm_fill.create_sprite(0, 0));
        gate_bottoms.push_back(bn::sprite_items::storm_fill.create_sprite(0, 0));
        gate_tops[i].set_visible(false);
        gate_bottoms[i].set_visible(false);
    }

    sky_bg->set_priority(3);
    cloud_bg->set_priority(2);
    mid_bg->set_priority(1);
    tree_bg->set_priority(0);

    hide_all_game_sprites();
    pip->set_visible(true);
    pip->set_position(0, 18);
    text_generator.set_center_alignment();
    render_title();

    while(true)
    {
        switch(current_state)
        {
            case state::title:
                handle_title();
                if(current_state == state::title)
                {
                    pip->set_tiles(bn::sprite_items::pip.tiles_item(), (frame_counter / 8) % 8);
                    ++frame_counter;
                }
                break;
            case state::code_entry:
                update_code_entry();
                break;
            case state::ready:
                handle_ready();
                break;
            case state::playing:
                handle_playing();
                break;
            case state::paused:
                handle_paused();
                break;
            case state::over:
                handle_over();
                break;
        }
        bn::core::update();
    }
}
