#PYINSTALLER_CMD := VERSIONER_PYTHON_PREFER_32_BIT=yes arch -i386 python $(HOME)/pyinstaller-2.0/pyinstaller.py
PYINSTALLER_CMD := python ../../pyinstaller-develop/pyinstaller.py
STREAMER_BASE ?= ..
STREAMER_SRC := $(STREAMER_BASE)/comicstreamerlib

APP_NAME := ComicStreamer
VERSION_STR := $(shell grep version $(STREAMER_SRC)/csversion.py| cut -d= -f2 | sed 's/\"//g')

MAC_BASE := $(STREAMER_BASE)/mac
DIST_DIR := $(MAC_BASE)/dist
STAGING := $(MAC_BASE)/$(APP_NAME)
APP_BUNDLE := $(DIST_DIR)/$(APP_NAME).app
VOLUME_NAME := $(APP_NAME)-$(VERSION_STR)
DMG_FILE := $(VOLUME_NAME).dmg

all: clean dist diskimage

dist:
	$(PYINSTALLER_CMD) $(STREAMER_BASE)/comicstreamer  -n $(APP_NAME) -s -w

	cp -a $(STREAMER_SRC)/templates $(APP_BUNDLE)/Contents/MacOS
	cp -a $(STREAMER_SRC)/static $(APP_BUNDLE)/Contents/MacOS
	cp $(MAC_BASE)/app.icns $(APP_BUNDLE)/Contents/Resources/icon-windowed.icns
	cp `which unrar` $(APP_BUNDLE)/Contents/MacOS
	
	rm -rf $(APP_BUNDLE)/Contents/MacOS/static/HTML5-Comic-Book-Reader

	# fix the version string in the Info.plist
	sed -i -e 's/0\.0\.0/$(VERSION_STR)/' $(MAC_BASE)/dist/ComicStreamer.app/Contents/Info.plist

clean:
	rm -rf $(DIST_DIR) $(MAC_BASE)/build
	rm -f $(MAC_BASE)/*.spec
	rm -f logdict*.log
	rm -f *~ *.pyc *.pyo
	rm -f raw*.dmg
	echo $(VERSION_STR)
diskimage:
	#Set up disk image staging folder
	rm -rf $(STAGING)
	mkdir $(STAGING)
	#cp $(STREAMER_BASE)/release_notes.txt $(STAGING)
	ln -s /Applications $(STAGING)/Applications
	cp -a $(APP_BUNDLE) $(STAGING)
	cp $(MAC_BASE)/volume.icns $(STAGING)/.VolumeIcon.icns
	SetFile -c icnC $(STAGING)/.VolumeIcon.icns

	##generate raw disk image
	rm -f $(DMG_FILE)
	hdiutil create -srcfolder $(STAGING) -volname $(VOLUME_NAME) -format UDRW -ov raw-$(DMG_FILE)	

	#remove working files and folders
	rm -rf $(STAGING)
	
	# we now have a raw DMG file.
	
	# remount it so we can set the volume icon properly
	mkdir -p $(STAGING)
	hdiutil attach raw-$(DMG_FILE) -mountpoint $(STAGING)
	SetFile -a C $(STAGING)
	hdiutil detach $(STAGING)
	rm -rf $(STAGING)
	
	# convert the raw image
	rm -f $(DMG_FILE)
	hdiutil convert raw-$(DMG_FILE) -format UDZO -o $(DMG_FILE)
	rm -f raw-$(DMG_FILE)
	
	#move finished product to release folder
	mkdir -p $(STREAMER_BASE)/release
	mv $(DMG_FILE) $(STREAMER_BASE)/release
	
