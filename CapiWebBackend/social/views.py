from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from django.db.models import Q
from .models import Profile, FriendRequest
from .serializers import ProfileSerializer, UserSerializer, FriendRequestSerializer

class FriendViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        """List confirmed friends"""
        profile, created = Profile.objects.get_or_create(user=request.user)
        friends = profile.friends.all().values_list('user', flat=True)
        users = User.objects.filter(id__in=friends)
        serializer = UserSerializer(users, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def requests(self, request):
        """List pending received requests"""
        requests = FriendRequest.objects.filter(to_user=request.user, status='pending')
        serializer = FriendRequestSerializer(requests, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def search_users(self, request):
        """Search users by username"""
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response([], status=status.HTTP_200_OK)
        
        # Search for users matching the query (case-insensitive, partial match)
        users = User.objects.filter(
            username__icontains=query
        ).exclude(
            id=request.user.id  # Exclude current user
        )[:10]  # Limit to 10 results
        
        serializer = UserSerializer(users, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def send_request(self, request):
        username = request.data.get('username')
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            to_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if to_user == request.user:
            return Response({'error': 'You cannot add yourself'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if already friends
        profile, created = Profile.objects.get_or_create(user=request.user)
        if profile.friends.filter(user=to_user).exists():
            return Response({'error': 'Already friends'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if request already exists
        if FriendRequest.objects.filter(from_user=request.user, to_user=to_user, status='pending').exists():
            return Response({'error': 'Request already sent'}, status=status.HTTP_400_BAD_REQUEST)

        if FriendRequest.objects.filter(from_user=to_user, to_user=request.user, status='pending').exists():
             return Response({'error': 'User already sent you a request'}, status=status.HTTP_400_BAD_REQUEST)

        FriendRequest.objects.create(from_user=request.user, to_user=to_user)
        return Response({'status': 'Request sent'})

    @action(detail=True, methods=['post'])
    def accept_request(self, request, pk=None):
        friend_request = get_object_or_404(FriendRequest, pk=pk, to_user=request.user, status='pending')
        
        # Add to friends (symmetrical)
        from_profile, created = Profile.objects.get_or_create(user=friend_request.from_user)
        to_profile, created = Profile.objects.get_or_create(user=request.user)
        
        # Add each other as friends
        to_profile.friends.add(from_profile)
        from_profile.friends.add(to_profile)
        
        # Update request status
        friend_request.status = 'accepted'
        friend_request.save()
        
        return Response({'status': 'Request accepted'})

    @action(detail=True, methods=['post'])
    def reject_request(self, request, pk=None):
        friend_request = get_object_or_404(FriendRequest, pk=pk, to_user=request.user, status='pending')
        friend_request.status = 'rejected'
        friend_request.save()
        return Response({'status': 'Request rejected'})
    
    @action(detail=False, methods=['post'])
    def remove_friend(self, request):
        """Remove a friend"""
        username = request.data.get('username')
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            friend_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get profiles
        user_profile, created = Profile.objects.get_or_create(user=request.user)
        friend_profile, created = Profile.objects.get_or_create(user=friend_user)
        
        # Remove friendship (symmetrical)
        user_profile.friends.remove(friend_profile)
        friend_profile.friends.remove(user_profile)
        
        return Response({'status': 'Friend removed'})

    @action(detail=False, methods=['post'])
    def remove(self, request):
        username = request.data.get('username')
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            friend_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        profile, created = Profile.objects.get_or_create(user=request.user)
        friend_profile, created = Profile.objects.get_or_create(user=friend_user)
        profile.friends.remove(friend_profile)
        return Response({'status': 'Friend removed'})

    @action(detail=False, methods=['post'])
    def upload_profile_photo(self, request):
        """Upload a profile photo"""
        if 'image' not in request.FILES:
            return Response({'error': 'No image file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        profile, created = Profile.objects.get_or_create(user=request.user)
        
        # Delete old profile picture if exists
        if profile.profile_picture:
            profile.profile_picture.delete(save=False)
        
        # Save new profile picture
        profile.profile_picture = request.FILES['image']
        profile.save()
        
        # Return the URL of the new profile picture
        profile_picture_url = request.build_absolute_uri(profile.profile_picture.url) if profile.profile_picture else None
        
        return Response({
            'status': 'Profile photo uploaded',
            'profile_picture_url': profile_picture_url
        })

    @action(detail=False, methods=['post'])
    def remove_profile_photo(self, request):
        """Remove current profile photo"""
        profile, created = Profile.objects.get_or_create(user=request.user)
        
        if profile.profile_picture:
            profile.profile_picture.delete(save=True)
            return Response({'status': 'Profile photo removed'})
        
        return Response({'error': 'No profile photo to remove'}, status=status.HTTP_400_BAD_REQUEST)

