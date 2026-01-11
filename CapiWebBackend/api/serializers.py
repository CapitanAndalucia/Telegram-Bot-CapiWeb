from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Ticket
from .models import PortfolioPhoto
from .models import Dibujos
from tickets.models import TelegramProfile
import logging

logger = logging.getLogger(__name__)

class DibujosSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dibujos
        fields = ['url', 'id', 'descripcion', 'imagen', 'palabras_clave', 'fecha_creacion', 'pin']
        extra_kwargs = {
            'url': {'view_name': 'dibujos-detail', 'lookup_field': 'pk'},
            'imagen': {'required': False}
        }
        read_only_fields = ('fecha_creacion',)

    def update(self, instance, validated_data):
        # permitir modificar fecha_creacion al hacer PUT/PATCH
        fecha_creacion = self.initial_data.get('fecha_creacion', None)
        if fecha_creacion:
            instance.fecha_creacion = fecha_creacion
        return super().update(instance, validated_data)

class TicketSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)
    
    class Meta:
        model = Ticket
        fields = ['id', 'usuario', 'usuario_nombre', 'titulo', 'fecha', 'coste', 'moneda']
        read_only_fields = ['usuario']  # ← AGREGAR ESTA LÍNEA
        # No marcar usuario como read_only para permitir que admin lo especifique

class PortfolioPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioPhoto
        fields = "__all__"

class TelegramProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    
    class Meta:
        model = TelegramProfile
        fields = ['id', 'username', 'email', 'telegram_id', 'has_telegram']
        read_only_fields = ['id', 'username', 'email', 'has_telegram']

class UserTelegramSerializer(serializers.ModelSerializer):
    """Serializer para actualizar datos de usuario y su perfil de Telegram"""
    telegram_id = serializers.IntegerField(
        source='telegram_profile.telegram_id',
        required=False,
        allow_null=True
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    old_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    # Campos de Google OAuth (solo lectura)
    has_google = serializers.SerializerMethodField()
    google_email = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'telegram_id', 'password', 'old_password',
            'has_google', 'google_email', 'has_password'
        ]
        read_only_fields = ['id', 'old_password', 'has_google', 'google_email', 'has_password']
    
    def get_has_google(self, obj):
        """Indica si el usuario tiene una cuenta de Google vinculada"""
        return hasattr(obj, 'google_profile')
    
    def get_google_email(self, obj):
        """Email de la cuenta de Google vinculada, si existe"""
        if hasattr(obj, 'google_profile'):
            return obj.google_profile.google_email
        return None
    
    def get_has_password(self, obj):
        """Indica si el usuario tiene contraseña establecida (importante para desvincular Google)"""
        return obj.has_usable_password()
    
    def validate(self, attrs):
        password = attrs.get('password')
        old_password = attrs.get('old_password')

        # Si se quiere cambiar la contraseña, la antigua es obligatoria
        if password:
            if not old_password:
                logger.debug(f"Password update failed for user {self.instance.username}: missing old password")
                raise serializers.ValidationError("Debes indicar tu contraseña actual.")
            user = self.instance
            if user and not user.check_password(old_password):
                logger.debug(f"Password update failed for user {self.instance.username}: incorrect old password")
                raise serializers.ValidationError("La contraseña actual no es correcta.")

        return super().validate(attrs)
    
    def update(self, instance, validated_data):
        # Extraer datos del perfil de Telegram si existen
        telegram_data = validated_data.pop('telegram_profile', {})
        password = validated_data.pop('password', None)
        validated_data.pop('old_password', None)
        
        # Actualizar usuario
        instance.username = validated_data.get('username', instance.username)
        instance.email = validated_data.get('email', instance.email)
        
        # Cambiar contraseña si se proporcionó
        if password:
            logger.info(f"Updating password for user {instance.username}")
            instance.set_password(password)
        
        instance.save()
        
        # Actualizar o crear perfil de Telegram
        if telegram_data:
            telegram_id = telegram_data.get('telegram_id')
            profile, created = TelegramProfile.objects.get_or_create(user=instance)
            profile.telegram_id = telegram_id
            profile.save()
            logger.info(f"Updated Telegram ID for user {instance.username}: {telegram_id}")
        
        return instance

from rest_framework import serializers
from .models import Tecnologia, Proyecto

class TecnologiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tecnologia
        fields = ['id', 'nombre', 'icono']


class ProyectoSerializer(serializers.ModelSerializer):
    # 👇 Devuelve la información completa de cada tecnología
    tecnologias = TecnologiaSerializer(many=True, read_only=True)

    # 👇 Para enviar IDs al crear/actualizar
    tecnologias_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tecnologia.objects.all(),
        many=True,
        write_only=True
    )

    class Meta:
        model = Proyecto
        fields = [
            'id',
            'titulo',
            'descripcion',
            'imagen',
            'tecnologias',      # lectura (nested)
            'tecnologias_ids',  # escritura
        ]

    def create(self, validated_data):
        tecnologias = validated_data.pop('tecnologias_ids')
        proyecto = Proyecto.objects.create(**validated_data)
        proyecto.tecnologias.set(tecnologias)
        return proyecto

    def update(self, instance, validated_data):
        tecnologias = validated_data.pop('tecnologias_ids', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        if tecnologias is not None:
            instance.tecnologias.set(tecnologias)

        return instance
