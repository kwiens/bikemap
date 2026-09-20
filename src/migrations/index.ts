import * as migration_20260807_044718_initial_schema from './20260807_044718_initial_schema';
import * as migration_20260807_202004_trail_conditions from './20260807_202004_trail_conditions';
import * as migration_20260807_213812_condition_report_locks from './20260807_213812_condition_report_locks';
import * as migration_20260807_234413_condition_marks_closed from './20260807_234413_condition_marks_closed';
import * as migration_20260919_194419 from './20260919_194419';
import * as migration_20260920_004112_condition_city_integrity from './20260920_004112_condition_city_integrity';

export const migrations = [
  {
    up: migration_20260807_044718_initial_schema.up,
    down: migration_20260807_044718_initial_schema.down,
    name: '20260807_044718_initial_schema',
  },
  {
    up: migration_20260807_202004_trail_conditions.up,
    down: migration_20260807_202004_trail_conditions.down,
    name: '20260807_202004_trail_conditions',
  },
  {
    up: migration_20260807_213812_condition_report_locks.up,
    down: migration_20260807_213812_condition_report_locks.down,
    name: '20260807_213812_condition_report_locks',
  },
  {
    up: migration_20260807_234413_condition_marks_closed.up,
    down: migration_20260807_234413_condition_marks_closed.down,
    name: '20260807_234413_condition_marks_closed',
  },
  {
    up: migration_20260919_194419.up,
    down: migration_20260919_194419.down,
    name: '20260919_194419',
  },
  {
    up: migration_20260920_004112_condition_city_integrity.up,
    down: migration_20260920_004112_condition_city_integrity.down,
    name: '20260920_004112_condition_city_integrity'
  },
];
