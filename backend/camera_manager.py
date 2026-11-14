import threading
import cv2
import numpy as np

_active_cameras = {}
_lock = threading.Lock()


class CameraStream:
    def __init__(self, camera_id: str, url: str):
        self.camera_id = camera_id
        self.url = url
        self._cap = None
        self._thread = None
        self._latest_frame = None
        self._latest_frame_lock = threading.Lock()
        self._running = False

    def start(self):
        if self._running:
            return
        self._cap = cv2.VideoCapture(self.url)
        if not self._cap.isOpened():
            raise RuntimeError(f"Failed to open camera stream: {self.url}")
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if self._cap:
            self._cap.release()
            self._cap = None

    def _read_loop(self):
        while self._running:
            ret, frame = self._cap.read()
            if ret:
                with self._latest_frame_lock:
                    self._latest_frame = frame
            else:
                self._cap.release()
                self._cap = cv2.VideoCapture(self.url)

    def get_frame(self) -> np.ndarray | None:
        with self._latest_frame_lock:
            if self._latest_frame is not None:
                return self._latest_frame.copy()
            return None


def start_camera(camera_id: str, url: str):
    with _lock:
        if camera_id in _active_cameras:
            _active_cameras[camera_id].stop()
        stream = CameraStream(camera_id, url)
        stream.start()
        _active_cameras[camera_id] = stream


def stop_camera(camera_id: str):
    with _lock:
        stream = _active_cameras.pop(camera_id, None)
        if stream:
            stream.stop()


def get_frame(camera_id: str) -> np.ndarray | None:
    with _lock:
        stream = _active_cameras.get(camera_id)
        if stream:
            return stream.get_frame()
        return None


def is_active(camera_id: str) -> bool:
    with _lock:
        return camera_id in _active_cameras


def stop_all():
    with _lock:
        for cid in list(_active_cameras.keys()):
            _active_cameras[cid].stop()
        _active_cameras.clear()
