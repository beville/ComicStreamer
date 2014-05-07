from libs.rumps import rumps
import time
from PyObjCTools import AppHelper
import webbrowser
import os

from comicstreamerlib.folders import AppFolders

rumps.debug_mode(True)  # turn on command line logging information for development - default is off

class MacGui(rumps.App):
    def __init__(self, apiServer):
        super(MacGui, self).__init__("ComicStreamer", icon=AppFolders.imagePath("trout.png"))
        self.apiServer =  apiServer
        
        self.menu = [
            #rumps.MenuItem('About'), 
            'Show ComicStreamer UI',
            #None,  # None functions as a separator in your menu
            #{'Arbitrary':
            #    {"Depth": ["Menus", "It's pretty easy"],
            #     "And doesn't": ["Even look like Objective C", rumps.MenuItem("One bit", callback=self.onebitcallback)]}},
            None
        ]         
    
    #@rumps.clicked("About")
    #def about(self, sender):
    #    #sender.title = 'NOM' if sender.title == 'About' else 'About'  # can adjust titles of menu items dynamically
    #    rumps.alert("ComicStreamer")

    @rumps.clicked("Show ComicStreamer UI")
    def about(self, sender):
        webbrowser.open("http://localhost:{0}".format(self.apiServer.port), new=0)
        
    @rumps.clicked("Quit")
    def about(self, sender):
        #rumps.alert("My quit message")
        self.apiServer.shutdown()
        AppHelper.stopEventLoop()
        print "after stop"
        
    
    #@rumps.clicked("Arbitrary", "Depth", "It's pretty easy")  # very simple to access nested menu items
    #def does_something(self, sender):
    #    my_data = {'poop': 88}
    #    rumps.notification(title='Hi', subtitle='There.', message='Friend!',  data=my_data)
    
    
    #@rumps.clicked("Preferences")
    #def not_actually_prefs(self, sender):
    #    if not sender.icon:
    #        sender.icon = 'level_4.png'
    #    sender.state = not sender.state
    
    
    #@rumps.timer(4)  # create a new thread that calls the decorated function every 4 seconds
    #def write_unix_time(self, sender):
    #    with self.rumps_app.open('times', 'a') as f:  # this opens files in your app's Application Support folder
    #        f.write('The unix time now: {}\n'.format(time.time()))
    
    
    #@rumps.clicked("Arbitrary")
    #def change_statusbar_title(self, sender):
    #    app.title = 'Hello World' if self.rumps_app.title != 'Hello World' else 'World, Hello'
    
    
    @rumps.notifications
    def notifications(self, notification):  # function that reacts to incoming notification dicts
        print notification
    
    
    def onebitcallback(self, sender):  # functions don't have to be decorated to serve as callbacks for buttons
        print 4848484            # this function is specified as a callback when creating a MenuItem below
    