define([], function NavPiece() {

	function NavPiece(pages) {

		var currentIndex = new Datum(-1);

		this.currentPage = pages[0].page;

		this.onBind = function(element) {

			var pageElement = document.createElement("DIV");
			pageElement.dataset.bind = "currentPage";

			element.appendChild(pageElement);
		};

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			currentIndex(index);

			this.currentPage = pages[index].page;
		};

		this.getCurrentIndex = function() {

			return currentIndex();
		};
	}

	return NavPiece;
});
