export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

export const COLORS = {
  cream: 0xf4e6c8,
  creamHex: '#f4e6c8',
  gold: 0xf0c060,
  goldHex: '#f0c060',
  navy: 0x141a2e,
  navyHex: '#141a2e',
  panel: 0x1d2540,
  panelHex: '#1d2540',
  ink: 0x0a0d18,
  inkHex: '#0a0d18',
  green: 0x8fd14f,
  cyan: 0x67e8f9,
  red: 0xe4546a,
  violet: 0x8b7bd8,
  muted: 0x8a93b2,
};

export const FONT_SMALL = 'Silkscreen';
export const FONT_TITLE = '"Press Start 2P"';

export const PHYSICS = {
  runSpeed: 168,
  groundAccel: 1650,
  groundDecel: 2100,
  airAccel: 1150,
  airDrag: 520,
  gravity: 760,
  maxFall: 420,
  jumpVelocity: -352,
  jumpCutGravity: 1500,
  coyoteMs: 105,
  jumpBufferMs: 130,
  flapImpulse: -218,
  flapGravityBonus: 0,
  maxFlaps: 2,
  flapCooldownMs: 155,
  climbSpeed: 82,
  dashSpeed: 430,
  dashMs: 140,
  dashCooldownMs: 950,
  hurtIFramesMs: 1200,
  knockbackX: 150,
  knockbackY: -190,
};

export const FLIGHT = {
  forwardSpeed: 128,
  gravity: 620,
  flapImpulse: -214,
  maxRise: -250,
  minFlapGapMs: 150,
  ceilingPadding: 10,
};
