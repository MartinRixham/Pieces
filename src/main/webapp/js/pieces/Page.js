define(["./Library"], function Page(Library) {

	function Page(index, page, parent) {

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var page = document.createElement("DIV");
			page.dataset.bind = "content";

			var update = document.createElement("DIV");
			update.dataset.bind = "update";

			update.appendChild(page);
			element.appendChild(update);
		};

		this.update = new Library.Binding({

			events: {

				__PIECES_BIND__: function(event) {

					event.stopPropagation();
					parent.callHome(index);
				}
			}
		});

		this.content = page;
	}

	return Page;
});
