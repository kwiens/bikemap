import * as migration_20260807_044718_initial_schema from './20260807_044718_initial_schema';
import * as migration_20260919_194419 from './20260919_194419';
import * as migration_20260919_215743 from './20260919_215743';
import * as migration_20260919_223908_backfill_chattanooga_supplemental_trails from './20260919_223908_backfill_chattanooga_supplemental_trails';
import * as migration_20260919_224403 from './20260919_224403';

export const migrations = [
  {
    up: migration_20260807_044718_initial_schema.up,
    down: migration_20260807_044718_initial_schema.down,
    name: '20260807_044718_initial_schema',
  },
  {
    up: migration_20260919_194419.up,
    down: migration_20260919_194419.down,
    name: '20260919_194419',
  },
  {
    up: migration_20260919_215743.up,
    down: migration_20260919_215743.down,
    name: '20260919_215743',
  },
  {
    up: migration_20260919_223908_backfill_chattanooga_supplemental_trails.up,
    down: migration_20260919_223908_backfill_chattanooga_supplemental_trails.down,
    name: '20260919_223908_backfill_chattanooga_supplemental_trails',
  },
  {
    up: migration_20260919_224403.up,
    down: migration_20260919_224403.down,
    name: '20260919_224403',
  },
];
