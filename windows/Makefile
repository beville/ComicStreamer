# This Makefile expects that certain GNU utils are available:
# rm, cp, grep, cut, cat

HOMEPATH ?= $(HOME)
STREAMER_BASE?= ..
STREAMER_SRC := $(STREAMER_BASE)\comicstreamerlib
DIST_DIR := $(STREAMER_BASE)\windows\dist
NSIS_CMD :=	"C:\Program Files (x86)\NSIS\makensis.exe"
VERSION := $(shell grep version "$(STREAMER_SRC)/csversion.py" | cut -d= -f2)

all: clean dist package

dist:
	cd "$(STREAMER_BASE)" &
		"C:\Python27\Scripts\cxfreeze.bat" $(STREAMER_BASE)\comicstreamer --icon nsis\app.ico --base-name=Win32GUI 
	cp "$(STREAMER_BASE)\libs\comictaggerlib\UnRAR2\UnRARDLL\unrar.dll" $(DIST_DIR)
	cp -r "$(STREAMER_SRC)\templates" $(DIST_DIR)
	cp -r "$(STREAMER_SRC)\static" $(DIST_DIR)
	rem rm -rf "$(DIST_DIR)\static\HTML5-Comic-Book-Reader"
	
	
package:
	echo !define RELEASE_STR $(VERSION) > $(STREAMER_BASE)\windows\nsis\release.nsh
	$(NSIS_CMD) "$(STREAMER_BASE)\windows\nsis\comicstreamer.nsi"
	mv  "$(STREAMER_BASE)\windows\nsis\ComicStreamer*.exe" "$(STREAMER_BASE)\release"

clean:
	-rm -rf dist
	-rm -rf nsis/release.nsh
