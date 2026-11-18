from unittest.mock import patch

import pytest

import backend.camera_manager as camera_manager


@pytest.fixture(autouse=True)
def clean_cameras():
    camera_manager.stop_all()
    yield
    camera_manager.stop_all()


@patch("backend.camera_manager.CameraStream")
def test_start_camera_registers_stream(mock_stream_class):
    stream = mock_stream_class.return_value

    camera_manager.start_camera("c1", "http://camera/video")

    assert camera_manager.is_active("c1") is True
    stream.start.assert_called_once()
    assert camera_manager.get_frame("c1") is stream.get_frame.return_value


@patch("backend.camera_manager.CameraStream")
def test_start_failure_does_not_leave_camera_active(mock_stream_class):
    mock_stream_class.return_value.start.side_effect = RuntimeError("unreachable")

    with pytest.raises(RuntimeError):
        camera_manager.start_camera("c1", "http://camera/video")

    assert camera_manager.is_active("c1") is False


@patch("backend.camera_manager.CameraStream")
def test_stop_camera_stops_stream(mock_stream_class):
    stream = mock_stream_class.return_value
    camera_manager.start_camera("c1", "http://camera/video")

    camera_manager.stop_camera("c1")

    assert camera_manager.is_active("c1") is False
    stream.stop.assert_called_once()
