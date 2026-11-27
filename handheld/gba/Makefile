# Barrelwing Sky Sprint — GBA
# Pinned Butano 21.10.1. Build with devkitARM (container or native).
TARGET          :=  barrelwing-sky-sprint
BUILD           :=  build
LIBBUTANO       :=  $(BUTANO_ROOT)/butano
COMMON          :=  $(BUTANO_ROOT)/common
PYTHON          :=  python3
SOURCES         :=  src
INCLUDES        :=  include $(COMMON)/include
DATA            :=
GRAPHICS        :=  graphics $(COMMON)/graphics
AUDIO           :=  audio
AUDIOBACKEND    :=  maxmod
AUDIOTOOL       :=
DMGAUDIO        :=
DMGAUDIOBACKEND :=  null
ROMTITLE        :=  BARRELWING
ROMCODE         :=  BWS1
USERFLAGS       :=  -O2
USERCXXFLAGS    :=
USERASFLAGS     :=
USERLDFLAGS     :=
USERLIBDIRS     :=
USERLIBS        :=
DEFAULTLIBS     :=
STACKTRACE      :=
USERBUILD       :=
EXTTOOL         :=

ifndef BUTANO_ROOT
$(error BUTANO_ROOT is not set. Point it at the Butano 21.10.1 release directory.)
endif

ifndef LIBBUTANOABS
	export LIBBUTANOABS := $(realpath $(LIBBUTANO))
endif

include $(LIBBUTANOABS)/butano.mak
