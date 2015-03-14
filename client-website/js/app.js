//
// AngilarJS controller     

function SympleChat($scope) {
    $scope.client;
    $scope.localPlayer;
    $scope.remotePlayer;   
    $scope.remoteVideoPeer;    
    $scope.handle;
    $scope.directUser;    
    $scope.peers = [];  
    $scope.messages = []; 
    $scope.messageText = ""; 
    $scope.errorText = ""; 
    $scope.isLoading = false;
    $scope.audioEnabled = true;
    $scope.videoEnabled = true;
    $scope.isFullscreen = false;
    $scope.localVideoPlaying = false;

    $(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange', function() {
            if (!document.fullscreenElement &&    // alternative standard method
                !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {
	        $('.button-fullscreen').addClass('glyphicon-resize-full').removeClass('glyphicon-resize-small');
            } else {
	        $('.button-fullscreen').addClass('glyphicon-resize-small').removeClass('glyphicon-resize-full');
            }
    });

    $(document).ready(function() {            

        $('[data-toggle="tooltip"]').tooltip();

        //
        // Client

        $scope.client = new Symple.Client(CLIENT_OPTIONS); 
            
        $scope.client.on('announce', function(peer) {
            //console.log('announce:', peer)
            
            $scope.isLoading = false;  
            $scope.$apply();  
        });

        $scope.client.on('presence', function(p) {
            //console.log('presence:', p)
        });

        $scope.client.on('message', function(m) {
            //console.log('message:', m)   
            
            // Normal Message
            if (!m.direct || m.direct == $scope.handle) {
                $scope.messages.unshift({
                    user: m.from.user,
                    data: m.data,
                    direct: m.direct, 
                    time: Symple.formatTime(new Date)
                });
                $scope.$apply();
            }
            else
                console.log('dropping message:', m, m.direct)
        });
        
        $scope.client.on('command', function(c) {
            //console.log('command:', c)
                            
            if (c.node == 'call:init') {
            
                if (!c.status) {
                    if ($scope.remoteVideoPeer || $scope.localVideoPlaying) {
                        c.status = 501;
                        $scope.client.respond(c);
                        return;
                    }
                    // Show a dialog to the user asking if they want to accept the call
                    var e = $('#incoming-call-modal')
                    e.find('.caller').text('@' + c.from.user)
                    e.find('.accept').unbind('click').click(function() {
                        c.status = 200;
                        $scope.remoteVideoPeer = c.from;
                        $scope.client.respond(c);
                        $scope.$apply();
                        e.modal('hide')      
                    })
                    e.find('.reject').unbind('click').click(function() {
                        c.status = 500;
                        $scope.client.respond(c);
                        e.modal('hide')  
                    })
		    e.modal({backdrop:'static',keyboard:false})
                    e.modal('show')   
                }    
                else if (c.status == 200) {      
                    // Handle call accepted     
                    var e = $('#outgoing-call-modal')
                    e.modal('hide')
                    $scope.remoteVideoPeer = c.from;
                    $scope.startLocalVideo();      
                    $scope.$apply();
                }  
                else if (c.status == 500) {  
                    // Handle call rejected
                    var e = $('#callee-rejected')
                    e.find('.rejected').text('... rejected your call')
		    e.modal('show')
                } 
                else if (c.status == 501) {  
                    // Handle call busy
                    var e = $('#callee-rejected')
                    e.find('.rejected').text('... is busy')
		    e.modal('show')
                } 
                else {  
                    alert('Unknown response status')
                }             
            }
            else if (c.node == 'call:end') {
                if (c.from.user == $scope.remoteVideoPeer.user) {
                    $scope.toggleCallend();
                }
            }
        });

        $scope.client.on('event', function(e) {  
            //console.log('event:', e)     
            
            // Only handle events from the remoteVideoPeer
            if (!$scope.remoteVideoPeer || $scope.remoteVideoPeer.id != e.from.id) {                        
                console.log('mismatch event:', e.from, $scope.remoteVideoPeer)  
                return
            }
                            
            // ICE SDP
            if (e.name == 'call:ice:sdp') {                    
                if (e.sdp.type == 'offer') {  
                     
                    // Create the remote player on offer
                    if (!$scope.remotePlayer) {
                        $scope.remotePlayer = createPlayer($scope, 'answerer', '#video .remote-video');
                        $scope.remotePlayer.play();
                    }    
                    $scope.remotePlayer.engine.onRemoteSDP(e.sdp);             
                }
                if (e.sdp.type == 'answer') { 
                    $scope.localPlayer.engine.onRemoteSDP(e.sdp);                   
                }
            }
            
            // ICE Candidate
            else if (e.name == 'call:ice:candidate') {                                      
                if (e.origin == 'answerer')
                    $scope.localPlayer.engine.onRemoteCandidate(e.candidate);   
                else if (e.origin == 'caller') 
                    $scope.remotePlayer.engine.onRemoteCandidate(e.candidate);   
                else 
                    alert('Unknown candidate origin');
            } 
            
            else {
                alert('Unknown event: ' + e.name);                
            }
        });

        $scope.client.on('disconnect', function() {
            console.log('disconnected')
            $scope.isLoading = false;  
            $scope.errorText = 'Disconnected from the server';
            $scope.$apply();
        });

        $scope.client.on('error', function(error, message) {
            console.log('connection error:', error, message)
            $scope.isLoading = false;  
            $scope.errorText = 'Cannot connect to the server.';
            $scope.$apply();
        });

        $scope.client.on('addPeer', function(peer) {
            console.log('add peer:', peer)            
            $scope.peers.push(peer);
            $scope.$apply();
        });

        $scope.client.on('removePeer', function(peer) {
            console.log('remove peer:', peer)
            for (var i =0; i < $scope.peers.length; i++) {
                if ($scope.peers[i].id === peer.id) {
                    $scope.peers.splice(i,1);
                    $scope.$apply();
                    break;
                }
            }
        });
                
        // Init handle from URL if available
        var handle = getHandleFromURL();
        if (handle && handle.length) {     
            $scope.handle = handle;
            $scope.login();        
        }

        var cok = getCookie("username");
        if (cok != "") {
            $scope.handle=cok;
            $scope.login();
        }
    });    
           
    
    //
    // Messaging 
    
    $scope.setMessageTarget = function(user) {
        console.log('setMessageTarget', user)
        $scope.directUser = user ? user : ''
        $('#post-message .direct-user').text('@' + $scope.directUser)
        $('#post-message .message-text')[0].focus()
    } 
        
    $scope.sendMessage = function() {            
        if ($scope.messageText.length == 0) {
            return;
        }
        console.log('sendMessage', $scope.messageText);
        $scope.client.sendMessage({
            data: $scope.messageText, 
            direct: $scope.directUser
        });
        $scope.messages.unshift({
            direct: $scope.directUser,
            user: $scope.handle,
            data: $scope.messageText,
            time: Symple.formatTime(new Date)
        });
        $scope.messageText = "";          
    };
            
    // Login
    $scope.login = function() {
        if (!$scope.handle || $scope.handle.length < 3) {
            alert('Please enter 3 or more alphanumeric characters.');            
            return;
        }
        setCookie("username", $scope.handle, 365);
    
        $scope.client.options.peer.user = $scope.handle;
        $scope.client.connect();   
        $scope.isLoading = true;  
        $scope.$apply();    
    }

    $scope.logout = function() {
        setCookie("username", "", 1);
//        $scope.toggleCallend2();
        $scope.client.disconnect();
        document.location.reload(false);
/*
// should not call $scope.$apply();
//        $scope.toggleCallend2();
        $scope.client.disconnect();
//        $scope.client = undefined;
        $scope.handle = undefined;
        $scope.peers = [];  
        $scope.messages = []; 
        $scope.messageText = ""; 
        $scope.errorText = ""; 
        $scope.$apply();*/
    }
        
         
    //       
    // Video
    
    $scope.startVideoCall = function(user) {
        if (assertGetUserMedia()) {            
            console.log('startVideoCall', user)
            if (user == $scope.handle) {
                alert('Cannot video chat with yourself. Please open a new browser window and login with a different handle.');            
                return;
            }   
            
            $scope.client.sendCommand({
                node: 'call:init',
                to: { user: user }                
            })          
            var e = $('#outgoing-call-modal')
            e.find(".callee").text("@" + user)
            e.modal('show')
            var f = $('#callee-rejected')
            f.find(".rejected").text("")
        }         
    }
           
    $scope.startLocalVideo = function() {
        if (assertGetUserMedia()) {
        
            // Init local video player
            $scope.localPlayer = createPlayer($scope, 'caller', '#video .local-video');
            $scope.localPlayer.play({ localMedia: true, disableAudio: false });
            $scope.localPlayer.muteLocal();
            
            // TODO: Set false on session end or Symple error
            $scope.localVideoPlaying = true;

            // enable controls
	    /*$('.local-video-wrap').mouseenter(function () {
	        $('.local-video-control-wrap').stop().fadeIn('100'); 
	    });
	    $('.local-video-wrap').mouseleave(function () {
	        $('.local-video-control-wrap').stop().fadeOut('100'); 
	    });*/

        } 
    } 
        
    
    //
    // Helpers
    
    $scope.isLoggedIn = function() {
        return $scope.handle != null && $scope.client.online();
    }

    $scope.isSelfUser = function(u) {
        return $scope.handle == u;
    }
    
    $scope.getMessageClass = function(m) {
        if (m.direct)
            return 'list-group-item-warning';
        return '';
    }
    
    $scope.toggleAudio = function() {
        if ($scope.localPlayer != null)
        {
	    if ($scope.audioEnabled) {
	        $('.button-audio').addClass('glyphicon-volume-off').removeClass('glyphicon-volume-up');
	        $scope.audioEnabled = false;
	    } else {
	        $('.button-audio').addClass('glyphicon-volume-up').removeClass('glyphicon-volume-off');
	        $scope.audioEnabled = true;
	    }
            $scope.localPlayer.toggleAudio();
        }
    }
    
    $scope.toggleVideo = function() {
        if ($scope.localPlayer != null)
        {
	    if ($scope.videoEnabled) {
	        $('.button-video').addClass('glyphicon-eye-close').removeClass('glyphicon-eye-open');
	        $scope.videoEnabled = false;
	    } else {
	        $('.button-video').addClass('glyphicon-eye-open').removeClass('glyphicon-eye-close');
	        $scope.videoEnabled = true;
	    }
            $scope.localPlayer.toggleVideo();
        }
    }
    
    $scope.toggleFullscreen = function() {
        if ($scope.remotePlayer != null)
        {
            //$scope.remotePlayer.fullscreenVideo();
            var video = $('#video-fullscreen');
            if (!document.fullscreenElement &&    // alternative standard method
                !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement ) {
                if (video[0].requestFullscreen) {
                    video[0].requestFullscreen();
                } else if (video[0].mozRequestFullScreen) {
                    video[0].mozRequestFullScreen();
                } else if (video[0].webkitRequestFullscreen) {
                    video[0].webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        }

    }
    $scope.toggleCallend = function() {
        if ($scope.remotePlayer != undefined) {
            if ($scope.isFullscreen) {
                $scope.toggleFullscreen();
            }
            $scope.remotePlayer.stop();
            $scope.remotePlayer = undefined;
        }
        if ($scope.localPlayer != undefined) {
            if (!$scope.videoEnabled) {
                $scope.toggleVideo();
            }
            if (!$scope.audioEnabled) {
                $scope.toggleAudio();
            }
            $scope.localPlayer.stop();
            $scope.localPlayer = undefined;
        }
        $scope.remoteVideoPeer = undefined;
        $scope.localVideoPlaying = false;
        $scope.$apply();
    }
    $scope.toggleCallend2 = function() {
        $scope.client.sendCommand({
            node: 'call:end',
            to: { user: $scope.remoteVideoPeer.user }
        });
        $scope.toggleCallend();
    }
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
     var name = cname + "=";
     var ca = document.cookie.split(';');
     for(var i=0; i<ca.length; i++) {
         var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
         if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
     }
     return "";
}
