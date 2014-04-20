# coding=utf-8

"""
Some generic utilities
"""

"""
Copyright 2012-2014  Anthony Beville

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
import sys
import os
import re
import platform
import locale
import codecs
	
class UtilsVars:
	already_fixed_encoding = False

def get_actual_preferred_encoding():
	preferred_encoding = locale.getpreferredencoding()
	if platform.system() == "Darwin":	
		preferred_encoding = "utf-8"
	return preferred_encoding
	
def fix_output_encoding( ):
	if not UtilsVars.already_fixed_encoding:
		# this reads the environment and inits the right locale
		locale.setlocale(locale.LC_ALL, "")

		# try to make stdout/stderr encodings happy for unicode printing
		preferred_encoding = get_actual_preferred_encoding()
		sys.stdout = codecs.getwriter(preferred_encoding)(sys.stdout)
		sys.stderr = codecs.getwriter(preferred_encoding)(sys.stderr)
		UtilsVars.already_fixed_encoding = True

def get_recursive_filelist( pathlist ):
	"""
	Get a recursive list of of all files under all path items in the list
	"""
	filename_encoding = sys.getfilesystemencoding()	
	filelist = []
	for p in pathlist:
		# if path is a folder, walk it recursivly, and all files underneath
		if type(p) == str:
			#make sure string is unicode
			p = p.decode(filename_encoding) #, 'replace')
		elif type(p) != unicode:
			#it's probably a QString
			p = unicode(p)
		
		if os.path.isdir( p ):
			for root,dirs,files in os.walk( p ):
				for f in files:
					if type(f) == str:
						#make sure string is unicode
						f = f.decode(filename_encoding, 'replace')
					elif type(f) != unicode:
						#it's probably a QString
						f = unicode(f)
					filelist.append(os.path.join(root,f))
		else:
			filelist.append(p)
	
	return filelist
	
