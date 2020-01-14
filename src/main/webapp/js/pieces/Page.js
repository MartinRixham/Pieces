define(["./Library"], function NavButton() {

	function Page(index, page, parent) {

		this.page = page;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var page = document.createElement("DIV");
			page.dataset.bind = "page";

			element.appendChild(page);

			parent.callHome();
		};
	}

	return Page;
});
