import sys
import webbrowser
import os
from comicstreamerlib.folders import AppFolders

from PyQt4 import QtGui,QtCore

class SystemTrayIcon(QtGui.QSystemTrayIcon):
    def __init__(self, icon, app):
        QtGui.QSystemTrayIcon.__init__(self, icon, None)
        self.app = app
        self.menu = QtGui.QMenu(None)
        exitAction = self.menu.addAction("Exit")
        self.setContextMenu(self.menu)
        exitAction.triggered.connect( self.quit )

    def quit(self):

        QtCore.QCoreApplication.quit()
        

class QtBasedGui():
    def __init__(self, apiServer):
        self.apiServer =  apiServer
        
        self.app = QtGui.QApplication(sys.argv)
        
        pixmap = QtGui.QPixmap(AppFolders.imagePath("trout.png"))
        icon = QtGui.QIcon( pixmap.scaled(16,16))       

        self.trayIcon = SystemTrayIcon(icon,self)
    
        self.trayIcon.show() 

    def run(self):
        try:
            self.app.exec_()
        except KeyboardInterrupt:
            pass



if __name__ == '__main__':
    QtGui().run()
