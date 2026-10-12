// Access to the generated style registry (styles_gen.h).
#pragma once
#include "pgm.h"
#include "styles_gen.h"

namespace core {

inline StyleDef styleDef(uint8_t id) {
  StyleDef s;
  pgmCopy(&s, &STYLES[id < STYLE_COUNT ? id : 0], sizeof s);
  return s;
}

}  // namespace core
