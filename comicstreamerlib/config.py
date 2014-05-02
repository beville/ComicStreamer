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
import base64
import logging
import io

from configobj import ConfigObj
from validate import Validator

from options import Options
from libs.comictaggerlib.utils import which, addtopath

class ComicStreamerConfig(ConfigObj):

    @staticmethod
    def getUserFolder():
        filename_encoding = sys.getfilesystemencoding()
        if platform.system() == "Windows":
            folder = os.path.join( os.environ['APPDATA'], 'ComicStreamer' )
        elif platform.system() == "Darwin":
            folder = os.path.join( os.path.expanduser('~') , 'Library/Application Support/ComicStreamer')
        else:
            folder = os.path.join( os.path.expanduser('~') , '.ComicStreamer')
        if folder is not None:
            folder = folder.decode(filename_encoding)
        return folder
        
    frozen_win_exe_path = None
    
    @staticmethod
    def baseDir():
        encoding = sys.getfilesystemencoding()
        if getattr(sys, 'frozen', None):
            if platform.system() == "Darwin":
                return sys._MEIPASS
            else: # Windows
                #Preserve this value, in case sys.argv gets changed importing a plugin script
                if ComicStreamerConfig.frozen_win_exe_path is None:
                    ComicStreamerConfig.frozen_win_exe_path = os.path.dirname( os.path.abspath( unicode(sys.executable, encoding) ) )
                return ComicStreamerConfig.frozen_win_exe_path    
        else:
            return os.path.dirname( os.path.abspath(unicode(__file__, encoding)) )

    configspec = u"""
            [general]
            port=integer(default=8888)
            install_id=string(default="")
            folder_list=string_list(default=list())
            [security]
            username=string(default="")
            password_digest=string(default="1f81ba3766c2287a452d98a28a33892528383ddf3ce570c6b2911b0435e71940")
            api_key=string(default="")
            use_api_key=boolean(default="True")
            cookie_secret=string(default="")
           """
    

    def __init__(self):
        super(ComicStreamerConfig, self).__init__()
               
        self.csfolder = ComicStreamerConfig.getUserFolder()

        # make sure folder exisits
        if not os.path.exists( self.csfolder ):
            os.makedirs( self.csfolder )

        # set up initial values
        self.filename = os.path.join(self.csfolder, "settings")
        self.configspec=io.StringIO(ComicStreamerConfig.configspec)
        self.encoding="UTF8"
        
        # since some stuff in the configobj has to happen during object initialization,
        # use a temporary delegate,  and them merge it into self
        tmp = ConfigObj(self.filename, configspec=self.configspec, encoding=self.encoding)
        validator = Validator()
        tmp.validate(validator,  copy=True)
       
        # set up the install ID
        if tmp['general']['install_id'] == '':
            tmp['general']['install_id'] = uuid.uuid4().hex
            
        #set up the cookie secret
        if tmp['security']['cookie_secret'] == '':
            tmp['security']['cookie_secret'] = base64.b64encode(uuid.uuid4().bytes + uuid.uuid4().bytes)

        # normalize the folder list
        tmp['general']['folder_list'] = [os.path.abspath(os.path.normpath(unicode(a))) for a in tmp['general']['folder_list']]

        self.merge(tmp)
        if not os.path.exists( self.filename ):
            self.write()
            
        # not sure if this belongs here:
        # if mac app, and no unrar in path, add the one from the app bundle
        if getattr(sys, 'frozen', None) and  platform.system() == "Darwin":
            if which("unrar") is None:
                addtopath(ComicStreamerConfig.baseDir())
        
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
