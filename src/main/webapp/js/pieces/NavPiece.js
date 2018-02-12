define([], function NavPiece() {

	function NavPiece(pages) {

		var self = this;

		var activeIndex = new Datum(-1);

		var changedHash = false;

		function routePage() {

			if (changedHash) {

				changedHash = false;

				return;
			}

			for (var i = 0; i < pages.length; i++) {

				if ("#" + pages[i].route == location.hash) {

					self.currentPage = pages[i].page;
					activeIndex(i);

					return;
				}
			}

			self.currentPage = pages[0].page;
			activeIndex(-1);
		}

		routePage();

		window.addEventListener("hashchange", routePage);

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var pageElement = document.createElement("DIV");
			pageElement.dataset.bind = "currentPage";

			element.appendChild(pageElement);
		};

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			if ("#" + pages[index].route == location.hash) {

				return;
			}

			this.currentPage = pages[index].page;
			location.hash = pages[index].route;
			changedHash = true;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
