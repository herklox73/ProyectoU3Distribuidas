from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse

from .models import Campaign

User = get_user_model()


class CampaignOwnershipRegressionTest(TestCase):
    """
    Regression test for the IDOR (insecure direct object reference)
    vulnerability found during the P2 evaluation via the V6 security
    matrix (benchmark/seguridad_tokens.py): before the fix,
    api_campanas_detail / api_campanas_media / api_campanas_ejecutar
    validated that a request carried a valid session or JWT
    (authentication) but never checked whether that user owned the
    requested campaign (authorization) -- so any authenticated user
    could read or execute *any* campaign by guessing its numeric id.

    The fix added an `owner` FK on Campaign and the `_es_dueno_o_staff`
    helper, checked in the three views above. This test keeps that fix
    honest going forward: it fails loudly if the ownership check is
    ever removed or weakened again.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username='owner_user', password='testpass123')
        self.other = User.objects.create_user(username='other_user', password='testpass123')
        self.staff = User.objects.create_user(username='staff_user', password='testpass123', is_staff=True)
        self.campaign = Campaign.objects.create(
            owner=self.owner,
            name='Campaign owned by owner_user',
            message_template='Hola {{nombre}}',
        )

    def _detail_url(self):
        return reverse('mass_sender:api_campanas_detail', args=[self.campaign.id])

    def test_owner_can_access_own_campaign(self):
        self.client.force_login(self.owner)
        resp = self.client.get(self._detail_url())
        self.assertEqual(resp.status_code, 200)

    def test_other_authenticated_user_is_rejected_idor(self):
        """
        The exact case that failed before the fix (returned 200 instead
        of 403): a different, fully authenticated user must NOT be able
        to read someone else's campaign just because they are logged in.
        """
        self.client.force_login(self.other)
        resp = self.client.get(self._detail_url())
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json().get('error'), 'No autorizado')

    def test_staff_can_access_any_campaign(self):
        self.client.force_login(self.staff)
        resp = self.client.get(self._detail_url())
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_request_is_rejected(self):
        resp = self.client.get(self._detail_url())
        self.assertEqual(resp.status_code, 401)
