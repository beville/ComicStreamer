"""
Config class for comicstreamer app
"""

"""
Copyright 2014  Anthony Beville

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import os
import sys
import platform
import codecs
import uuid
import logging

from configobj import ConfigObj

from options import Options

class ComicStreamerConfig(ConfigObj):

    @staticmethod
    def getUserFolder():
        filename_encoding = sys.getfilesystemencoding()
        if platform.system() == "Windows":
            folder = os.path.join( os.environ['APPDATA'], 'ComicStreamer' )
        if platform.system() == "Darwin":
            folder = os.path.join( os.path.expanduser('~') , 'Library/Application Support/ComicStreamer')
        else:
            folder = os.path.join( os.path.expanduser('~') , '.ComicStreamer')
        if folder is not None:
            folder = folder.decode(filename_encoding)
        return folder
        
    frozen_win_exe_path = None
    
    @staticmethod
    def baseDir():
        if getattr(sys, 'frozen', None):
            if platform.system() == "Darwin":
                return sys._MEIPASS
            else: # Windows
                #Preserve this value, in case sys.argv gets changed importing a plugin script
                if ComicStreamerConfig.frozen_win_exe_path is None:
                    ComicStreamerConfig.frozen_win_exe_path = os.path.dirname( os.path.abspath( sys.argv[0] ) )
                return ComicStreamerConfig.frozen_win_exe_path
        else:
            return os.path.dirname( os.path.abspath( __file__) )


    def setDefaultValues( self ):

        general = {
            'port': 8888,
            'install_id' : uuid.uuid4().hex,
            'folder_list': [],
            'debug': False,
            'loglevel': logging.INFO,
        }

        self['general'] = general

    def __init__(self):
        super(ComicStreamerConfig, self).__init__()
               
        encoding="UTF8"
        default_encoding="UTF8"
        
        self.csfolder = ComicStreamerConfig.getUserFolder()

        if not os.path.exists( self.csfolder ):
            os.makedirs( self.csfolder )

        self.setDefaultValues()
        self.filename = os.path.join(self.csfolder, "settings")
                
        # if config file doesn't exist, write one out
        if not os.path.exists( self.filename ):
            self.write()
        else:
            tmp = ConfigObj(self.filename)
            self.merge(tmp)
            self['general']['folder_list'] = [os.path.abspath(os.path.normpath(unicode(a))) for a in self['general']['folder_list']]
            
    def applyOptions( self, opts ):

        modified = False
        
        if opts.port is not None:
            self['general']['port'] = opts.port
            modified = True

        if opts.folder_list is not None:
            self['general']['folder_list'] = [os.path.abspath(os.path.normpath(unicode(a))) for a in opts.folder_list]
            modified = True

        if modified:
            self.write()
