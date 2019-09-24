define(["./Library", "./Route"], function NavPiece(Library, Route) {

	var route = new Route();

	function NavPiece(pages) {

		var self = this;

		var currentIndex = new Library.Datum(0);

		var activeIndex = new Library.Datum(-1);

		var routeIndex = -1;

		this.currentPage = pages[0].page;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");
			page.dataset.bind = "currentPage";

			element.appendChild(page);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						var changed = routePage(word);
						route.update(routeIndex);

						return changed;
					},
					get: function() {

						return pages[currentIndex()].route;
					}
				});
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					activeIndex(i);

					return setPage(i);
				}
			}

			activeIndex(-1);

			return setPage(0);
		}

		function setPage(index) {

			if (self.currentPage == pages[index].page) {

				return false;
			}

			self.currentPage = pages[index].page;
			currentIndex(index);

			return true;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			var oldIndex = currentIndex();

			if (oldIndex != index) {

				route.changePage(routeIndex);
			}

			currentIndex(index);

			route.update(routeIndex);

			this.currentPage = pages[index].page;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
