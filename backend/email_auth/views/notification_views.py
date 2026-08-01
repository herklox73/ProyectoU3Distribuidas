"""Notificaciones personalizadas y con adjunto. Equivalente Django de notification/attachment controller+routes.js."""
from rest_framework.decorators import api_view, authentication_classes, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from ..services import attachment_service, notification_service


@api_view(["POST"])
@authentication_classes([])
def send_notification(request):
    result = notification_service.send_custom_notification(
        to=request.data.get("to"),
        subject=request.data.get("subject"),
        title=request.data.get("title"),
        message=request.data.get("message"),
        signature=request.data.get("signature", ""),
    )
    return Response(result, status=200)


@api_view(["POST"])
@authentication_classes([])
@parser_classes([MultiPartParser, FormParser])
def send_attachment(request):
    result = attachment_service.send_attachment_notification(
        to=request.data.get("to"),
        subject=request.data.get("subject"),
        title=request.data.get("title"),
        message=request.data.get("message"),
        signature=request.data.get("signature", ""),
        file=request.FILES.get("file"),
    )
    return Response(result, status=202)
