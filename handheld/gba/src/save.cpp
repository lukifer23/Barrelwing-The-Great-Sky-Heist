#include "save.hpp"

#include "bn_sram.h"

namespace barrelwing
{
    namespace
    {
        constexpr uint32_t save_magic = 0x42575331; // BWS1
        constexpr uint16_t save_version = 1;
        constexpr int slot_size = 64;
        constexpr int slot_count = 2;

        struct slot_record
        {
            uint32_t magic;
            uint16_t version;
            uint16_t sequence;
            uint32_t classic_best;
            uint32_t gale_best;
            uint32_t challenge_classic_best;
            uint32_t challenge_gale_best;
            uint32_t challenge_seed;
            uint32_t challenge_class;
            uint32_t checksum;
        };

        uint32_t crc32(const uint8_t* data, int size)
        {
            uint32_t crc = 0xffffffff;
            for(int i = 0; i < size; ++i)
            {
                crc ^= data[i];
                for(int bit = 0; bit < 8; ++bit)
                {
                    crc = (crc >> 1) ^ (0xedb88320u & (0u - (crc & 1u)));
                }
            }
            return ~crc;
        }

        bool read_slot(int index, slot_record& record)
        {
            bn::sram::read_offset(record, index * slot_size);
            if(record.magic != save_magic || record.version != save_version)
            {
                return false;
            }
            const int body_size = int(sizeof(slot_record)) - int(sizeof(uint32_t));
            return crc32(reinterpret_cast<const uint8_t*>(&record), body_size) == record.checksum;
        }

        void write_slot(int index, slot_record& record)
        {
            const int body_size = int(sizeof(slot_record)) - int(sizeof(uint32_t));
            record.magic = save_magic;
            record.version = save_version;
            record.checksum = crc32(reinterpret_cast<const uint8_t*>(&record), body_size);
            bn::sram::write_offset(record, index * slot_size);
        }
    }

    save_data load_save()
    {
        save_data result;
        slot_record slots[slot_count] = {};
        bool valid[slot_count] = { read_slot(0, slots[0]), read_slot(1, slots[1]) };
        int selected = -1;
        for(int i = 0; i < slot_count; ++i)
        {
            if(valid[i] && (selected < 0 || slots[i].sequence > slots[selected].sequence))
            {
                selected = i;
            }
        }
        if(selected < 0)
        {
            return result;
        }
        const slot_record& slot = slots[selected];
        result.classic_best = slot.classic_best;
        result.gale_best = slot.gale_best;
        result.challenge_classic_best = slot.challenge_classic_best;
        result.challenge_gale_best = slot.challenge_gale_best;
        result.challenge_seed = slot.challenge_seed;
        result.challenge_class = int(slot.challenge_class);
        result.sequence = slot.sequence;
        result.valid = true;
        return result;
    }

    void commit_save(save_data& data)
    {
        slot_record slots[slot_count] = {};
        bool valid[slot_count] = { read_slot(0, slots[0]), read_slot(1, slots[1]) };
        int target = 0;
        uint16_t next_sequence = 1;
        for(int i = 0; i < slot_count; ++i)
        {
            if(valid[i] && slots[i].sequence >= next_sequence)
            {
                next_sequence = uint16_t(slots[i].sequence + 1);
                target = 1 - i;
            }
        }
        slot_record record = {};
        record.sequence = next_sequence;
        record.classic_best = data.classic_best;
        record.gale_best = data.gale_best;
        record.challenge_classic_best = data.challenge_classic_best;
        record.challenge_gale_best = data.challenge_gale_best;
        record.challenge_seed = data.challenge_seed;
        record.challenge_class = uint32_t(data.challenge_class);
        write_slot(target, record);
        data.sequence = next_sequence;
        data.valid = true;
    }
}
