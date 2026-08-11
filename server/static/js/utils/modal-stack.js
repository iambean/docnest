// 弹窗栈管理（用于多级弹窗的 ESC 键退出）
const modalStack = [];

function pushModal(modalId, closeFunction) {
  modalStack.push({
    id: modalId,
    close: closeFunction
  });
}

function removeModal(modalId) {
  const index = modalStack.findIndex(modal => modal.id === modalId);
  if (index !== -1) {
    modalStack.splice(index, 1);
  }
}

function closeTopModal() {
  if (modalStack.length > 0) {
    const topModal = modalStack[modalStack.length - 1];
    if (topModal && topModal.close) {
      topModal.close();
    }
  }
}

// ESC 键关闭（按栈的顺序关闭弹窗）
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    // 按照栈的顺序关闭最顶层的弹窗
    closeTopModal();
  }
});
