from rest_framework import serializers
from .models import Profile, FriendRequest
from django.contrib.auth.models import User

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']

class ProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    friends = UserSerializer(many=True, read_only=True)

    class Meta:
        model = Profile
        fields = ['id', 'user', 'friends']

class FriendRequestSerializer(serializers.ModelSerializer):
    from_user_username = serializers.ReadOnlyField(source='from_user.username')
    to_user_username = serializers.ReadOnlyField(source='to_user.username')

    class Meta:
        model = FriendRequest
        fields = ['id', 'from_user', 'from_user_username', 'to_user', 'to_user_username', 'status', 'created_at']
        read_only_fields = ['from_user', 'to_user', 'status', 'created_at']
